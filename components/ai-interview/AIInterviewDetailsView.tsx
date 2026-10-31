'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  ArrowLeft, ChevronLeft, Video, Clock, Users, Calendar, CheckCircle, Mail,
  Copy, Trash2, Archive, ArchiveRestore, GitBranch,
  Loader2, Briefcase, Globe, ChevronRight, ChevronDown, Check, Brain, Sparkles,
  Layers, Pencil, Zap, Timer, FileText, Settings, CheckCircle2, Download,
  QrCode, AlertCircle, ExternalLink, BarChart, UserRound, Eye, User as UserIcon,
  Sliders, Info, Star,
} from 'lucide-react';
import { toast } from 'sonner';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import { Badge } from '@/components/ui/badge';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { useUrlTab } from '@/lib/hooks/useUrlTab';
import { aiInterviewService, isJdDisabled, JD_DISABLED_ACTION_MESSAGE, isInterviewConfigArchived } from '@/lib/services/aiInterviewService';
import {
  interviewVersionOrdinal as storedInterviewVersionOrdinal,
  interviewDuplicateBlockedReason,
  interviewEditBlockedReason,
} from '@/lib/utils/aiInterviewVersion';
import { aiInterviewDraftResumeHref, aiInterviewConfigureHref, markUnsavedVersion } from '@/lib/utils/aiInterviewDraftResume';
import { jdService, type JDLineageVersion, type JDResponse } from '@/lib/services/jdService';
import JDIdentityHeader from '@/components/jobs/JDIdentityHeader';
import JDOverviewSections from '@/components/jobs/JDOverviewSections';
import { Button } from '@/components/ui/button';
import { tabPill } from '@/components/ui/filter-pills';
import ExportFormatModal from '@/components/ExportFormatModal';
import { exportRows, type ExportFileFormat } from '@/lib/utils/exportUtils';
import type {
  AIInterviewResponse,
  AIInterviewHRQuestion,
  AIInterviewAuditActivity,
} from '@/lib/services/aiInterviewService';
import CandidateResultsView from './CandidateResultsView';
import AIInterviewResults from './AIInterviewResults';
import { useInviteDialog } from '@/components/talent-match-invite/InviteDialogProvider';
import AIInterviewTrackInvitesModal from '../AIInterviewTrackInvitesModal';
import { QuestionDistributionPopover } from './QuestionDistributionPopover';
import { PROXY_INTEGRITY_VERIFICATION_ENABLED } from '@/lib/constants/featureFlags';
import { formatIST, parseIST } from '@/lib/utils/dateUtils';
import { getPriorityLabel } from '@/lib/constants/aiInterviewPriority';
import { modeFromConfig, modeFromDuration } from '@/lib/constants/aiInterviewMode';
import PageBreadcrumb, { type BreadcrumbCrumb } from '@/components/PageBreadcrumb';
import RecordPager from '@/components/RecordPager';
import { Skeleton } from '@/components/ui/skeleton';
import UnpublishedChangesChip, { hasUnpublishedChanges } from './UnpublishedChangesChip';
import ArchiveAIInterviewModal from './ArchiveAIInterviewModal';

/* The Version History tab's eye opens a version's configuration in the same
   read-only dialog used elsewhere. Loaded lazily: that dialog renders this
   view itself (configureOnly), so a static import would be circular. */
const ConfigurePreviewDialog = dynamic(() => import('./ConfigurePreviewDialog'), { ssr: false });

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
  // p-4 below sm: the standard card inset on phones (was a flat p-5).
  return (
    <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3.5 border-b border-gray-100 bg-gray-50">
        <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
          <Icon className="w-4 h-4 text-brand-blue" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 tracking-tight">{title}</h3>
        {titleAfter}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
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
  // nowrap + no shrink: beside a long cluster name on a phone the pill was
  // squeezed into a 3-line "P3 / – / Low" stack.
  return (
    <span className={`inline-flex items-center flex-shrink-0 whitespace-nowrap px-2 py-0.5 text-2xs font-medium rounded-full border ${color}`}>
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
  onRefresh?: () => void | Promise<void>;
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
  /** Where this page was opened from (`?from=…`), kept on links to other
   *  versions and to the config flow so their breadcrumbs keep the origin. */
  originQuery?: string;
  /**
   * Render ONLY the Interview Details → Configure Details section — no page
   * chrome, header, tabs or background loads. Used by the Send Invite
   * picker's preview popup so a recruiter can check an interview's setup
   * without leaving the dialog.
   */
  configureOnly?: boolean;
  /** Tab to open on — e.g. 'results' when reached from "View Results". */
  initialTab?: 'overview' | 'activity' | 'versions' | 'viewjd' | 'results' | 'invites';
  /**
   * A DRAFT interview opened on its own page: every region greyed out and
   * inert except Continue Editing, which stays live and highlighted — the
   * Assessments page's draft lock (`AssessmentDetailsView`'s `draftLocked`).
   */
  draftLocked?: boolean;
}

const DETAIL_TABS = ['overview', 'activity', 'versions', 'viewjd', 'results', 'invites'] as const;
type DetailTab = typeof DETAIL_TABS[number];

export default function AIInterviewDetailsView({ config, onBack, onRefresh, currentIndex, totalCount, onPrev, onNext, breadcrumbItems, configureOnly = false, initialTab, draftLocked = false, originQuery = '' }: AIInterviewDetailsViewProps) {
  /* Greyed and out of reach — `inert` takes pointer, keyboard and assistive
     tech; the classes are the visual state. Per region, so Continue Editing,
     nested among them, can stay live. */
  const draftLockProps = draftLocked
    ? { inert: true as const, 'aria-disabled': true, className: 'opacity-50 grayscale select-none' }
    : { className: '' };
  const router = useRouter();
  const { user, isTenantAdmin, hasPermissionCode } = useAuth();
  /** A link into the config flow, carrying `originQuery` so its breadcrumb
   *  keeps the page this was opened from. */
  const withOrigin = (url: string) =>
    originQuery ? `${url}${url.includes('?') ? '&' : '?'}${originQuery.slice(1)}` : url;
  /** Job Details for this interview's JD — Go to JD and View JD's "Open full
   *  JD page" alike — carrying this interview so the JD page's trail reads
   *  AI Interviews › <interview> › job, and this page's own list / tab query
   *  so that crumb comes back to the same view. */
  const jobDetailsHref = (jdId: string) => {
    const params = new URLSearchParams({
      id: jdId,
      from: 'ai-interview-details',
      interview_id: config.id,
      interview_title: config.jd_title || config.position || '',
    });
    const here = typeof window !== 'undefined' ? window.location.search.replace(/^\?/, '') : '';
    if (here) params.set('interview_query', here);
    return `/recruitment/job-details?${params.toString()}`;
  };
  const canCreateAIInterviews = isTenantAdmin || !!user?.permissions?.canCreateAIInterviews;
  const canUpdateAIInterviews = isTenantAdmin || !!user?.permissions?.canUpdateAIInterviews;
  const canArchiveAIInterviews = isTenantAdmin || !!user?.permissions?.canArchiveAIInterviews;
  const canDeleteAIInterviews = isTenantAdmin || !!user?.permissions?.canDeleteAIInterviews;
  // Share and Invite are the same action (both open THE invite popup to
  // send a candidate their interview link) — checked via the Invite
  // permission so both entry points across the app agree on one gate.
  const canShareAIInterviews = isTenantAdmin || !!user?.permissions?.canInviteAIInterviews;
  // Export (clusters & HR questions file) — `ai_interview:export`; greyed, not hidden.
  const canExportAIInterviews = isTenantAdmin || hasPermissionCode('ai_interview:export');
  // A disabled JD keeps its interview visible but read-only: every action
  // below is blocked until the job is enabled again (the backend refuses too).
  const jdDisabled = isJdDisabled(config.jd_status);
  /* In the URL (`?detailTab=`), so a refresh reopens the same tab; a link's
     own `initialTab` is the default. Moving to another version is a new URL
     without the param, so it opens on the requested tab again. Not in the
     embedded Configure-only render, whose URL belongs to its host. */
  const [activeTab, setActiveTab] = useUrlTab<DetailTab>('detailTab', DETAIL_TABS, initialTab ?? 'overview', !configureOnly);
  /* Interview Details' own sub-tabs — Configure Details (what the tab used to
     show outright) and Interview Info (the former standalone "AI Interview
     Info" sidebar item, folded in here since it's the same JD-derived
     metadata about the same interview, just read-only). */
  const [detailsSubTab, setDetailsSubTab] = useUrlTab<'configure' | 'info'>('detailSubTab', ['configure', 'info'], 'configure', !configureOnly);
  const [actionLoading, setActionLoading] = useState(false);
  // Archive confirm — the Assessment Details header's own confirm-before-write
  // shape, using the same dedicated modal the AI Interviews list already
  // shows for this action (`ArchiveAIInterviewModal`), so the warning cannot
  // drift between the two surfaces.
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  // Invite — THE invite popup (the one Assessments uses), for this job and
  // this interview version (its version cards are left out).
  const { open: openInvite } = useInviteDialog();
  // CSV / Excel picker for the clusters & HR questions export.
  const [showExportModal, setShowExportModal] = useState(false);

  /* ARCHIVED — the Assessment Details page's arrival toast: once per config
     per visit (Prev, Next or the URL), decided on its first render only, so
     archiving it in place isn't then announced as an arrival on an archived
     one. Not in the embedded Configure-only render. */
  const archivedToastShownFor = useRef<string | null>(null);
  useEffect(() => {
    if (configureOnly || archivedToastShownFor.current === config.id) return;
    archivedToastShownFor.current = config.id;
    if (config.status !== 'archived') return;
    toast.info('This AI Interview is currently Archived. Please unarchive it to continue.');
  }, [configureOnly, config.id, config.status]);

  // Activity
  const [recentActivity, setRecentActivity] = useState<AIInterviewResponse[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Version History
  /* Version History — every interview version authored against this job
     version (the Assessments page's Version History, for interviews). The
     rows are `siblingConfigsByJdId`'s bucket; completed counts are asked for
     per version when the tab opens, since the config list carries none. */
  const [versionCompleted, setVersionCompleted] = useState<Record<string, number>>({});
  const versionCompletedRequested = useRef<Set<string>>(new Set());
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);

  /* Recent Activity — the Job Description page's Recent Activity, for this
     interview: one row per EVENT, newest first. The interview's own lifecycle
     (created, published / republished, updated, archived, re-enabled, …) comes
     from the audit trail scoped to this config; candidate events (invited,
     started, completed, …) from its sessions, which open the candidate. */
  const [lifecycleEvents, setLifecycleEvents] = useState<AIInterviewAuditActivity[] | null>(null);
  const [activityPage, setActivityPage] = useState(1);

  /* Header's Job Version dropdown — the Assessment Details header's "Manage
     Jobs · V{n}" pill: the linked JD's own version lineage. A row is only
     clickable when that job version actually has an AI interview config
     (`siblingConfigsByJdId` below) — otherwise there is nothing to open, the
     same rule the Total Jobs tab's View Versions panel applies. */
  const [showJobVersionMenu, setShowJobVersionMenu] = useState(false);
  /** Leftward nudge (px, <= 0) so the left-anchored menu stays on screen when
   *  the pill wraps to the right half of a phone-width header card. */
  const [jobVersionMenuShift, setJobVersionMenuShift] = useState(0);
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

  /* A send / copied link from the Share dialog: reload the activity list, the
     header's invite counts and the Invites-tab tracker at once, instead of
     leaving them stale until the tracker's next poll or a page refresh. */
  const [inviteRefreshTick, setInviteRefreshTick] = useState(0);
  const refreshAfterInvite = useCallback(() => {
    loadActivity();
    void onRefresh?.();
    setInviteRefreshTick((t) => t + 1);
  }, [loadActivity, onRefresh]);
  // The popup lives in the dashboard provider and may call onSent after a
  // re-render — always run the latest refresher.
  const refreshAfterInviteRef = useRef(refreshAfterInvite);
  refreshAfterInviteRef.current = refreshAfterInvite;

  // Always load activity on mount (needed for invite count in header)
  useEffect(() => {
    if (configureOnly) return;
    loadActivity();
  }, [loadActivity, configureOnly]);

  useEffect(() => {
    if (configureOnly || activeTab !== 'activity') return;
    let cancelled = false;
    (async () => {
      try {
        const items: AIInterviewAuditActivity[] = [];
        for (let page = 1; page <= 20; page += 1) {
          const res = await aiInterviewService.getAuditTrail({
            config_id: config.id, category: 'config_lifecycle', page, page_size: 100,
          });
          items.push(...(res.items || []));
          if ((res.items || []).length < 100 || items.length >= (res.total ?? items.length)) break;
        }
        // Scoped server-side; filtered again in case the endpoint ignores config_id.
        if (!cancelled) setLifecycleEvents(items.filter((e) => !e.config_id || e.config_id === config.id));
      } catch {
        if (!cancelled) setLifecycleEvents([]);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTab, config.id, configureOnly]);

  /** This job version's interviews, oldest first — V1 is the original. */
  const jobVersionInterviews = useMemo(() => {
    const bucket = config.jd_id ? siblingConfigsByJdId.get(config.jd_id) : undefined;
    return [...(bucket ?? [])].sort(
      (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime(),
    );
  }, [siblingConfigsByJdId, config.jd_id]);

  useEffect(() => {
    if (activeTab !== 'versions') return;
    jobVersionInterviews.forEach((v) => {
      if (versionCompletedRequested.current.has(v.id)) return;
      versionCompletedRequested.current.add(v.id);
      aiInterviewService.getConfigInvitations(v.id, { page: 1, page_size: 1, compact: true })
        .then((res) => setVersionCompleted((prev) => ({ ...prev, [v.id]: res.completed || 0 })))
        .catch(() => { versionCompletedRequested.current.delete(v.id); });
    });
  }, [activeTab, jobVersionInterviews]);

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
        const { live, archived } = await aiInterviewService.listAllConfigsSplit();

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

  /** This config's version among every interview authored against its job
   *  version - the "Interview Version" badge's number. The stored number wins;
   *  creation order is the fallback for a row that has none yet. */
  const interviewVersionOrdinal = useMemo(
    () => storedInterviewVersionOrdinal(config, siblingConfigsByJdId.get(config.jd_id || '') ?? []),
    [siblingConfigsByJdId, config],
  );

  /** Every version of this interview, any status - what Duplicate's draft and
   *  cap rules are judged against. */
  const lineageConfigs = useMemo(
    () => (config.jd_id ? siblingConfigsByJdId.get(config.jd_id) ?? [] : []),
    [siblingConfigsByJdId, config.jd_id],
  );
  const duplicateBlockedReason = jdDisabled
    ? JD_DISABLED_ACTION_MESSAGE
    : interviewDuplicateBlockedReason(config, lineageConfigs, canCreateAIInterviews);
  const editBlockedReason = jdDisabled
    ? JD_DISABLED_ACTION_MESSAGE
    : !canUpdateAIInterviews
      ? 'You do not have permission to edit AI interviews'
      : interviewEditBlockedReason(config);

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
    if (jdDisabled) {
      toast.error(JD_DISABLED_ACTION_MESSAGE);
      return;
    }
    if (config.interview_link) {
      const fullLink = `${window.location.origin}${config.interview_link}`;
      await navigator.clipboard.writeText(fullLink);
      toast.success('Interview link copied to clipboard');
    }
  };

  const handleDuplicate = async () => {
    if (duplicateBlockedReason) {
      toast.error(duplicateBlockedReason);
      return;
    }
    setActionLoading(true);
    try {
      const result = await aiInterviewService.clone(config.id);
      await onRefresh?.();
      toast.success(`New version created as a draft: ${result.cloned_title}`);
      // Open the new draft straight in Configure so it can be edited at once.
      // Unsaved until Save as Draft: Discard anywhere in the wizard deletes it.
      markUnsavedVersion(result.cloned_id);
      router.push(withOrigin(aiInterviewConfigureHref(result.cloned_id, config.jd_id || '')));
    } catch (error: any) {
      toast.error(friendlyErrorMessage(error, "Couldn't duplicate config. Please try again."));
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchive = async () => {
    if (jdDisabled) {
      toast.error(JD_DISABLED_ACTION_MESSAGE);
      setConfirmAction(null);
      return;
    }
    setActionLoading(true);
    try {
      await aiInterviewService.archive(config.id);
      await onRefresh?.();
      toast.success('Config archived');
    } catch (error: any) {
      toast.error(friendlyErrorMessage(error, "Couldn't archive AI interview. Please try again."));
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  /* The AI Interviews list's Unarchive (AIInterview.tsx handleUnarchiveConfig):
     the backend restores it to Draft or Active, the toast names which. */
  const handleUnarchive = async () => {
    if (jdDisabled) {
      toast.error(JD_DISABLED_ACTION_MESSAGE);
      return;
    }
    if (!canArchiveAIInterviews) {
      toast.error('You do not have permission to unarchive AI interviews');
      return;
    }
    setActionLoading(true);
    try {
      const restored = await aiInterviewService.unarchive(config.id);
      await onRefresh?.();
      toast.success(
        restored.status === 'draft'
          ? 'Configuration restored to Draft'
          : 'Configuration restored to Active'
      );
    } catch (error: any) {
      toast.error(friendlyErrorMessage(error, "Couldn't unarchive AI interview. Please try again."));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (jdDisabled) {
      toast.error(JD_DISABLED_ACTION_MESSAGE);
      setConfirmAction(null);
      return;
    }
    setActionLoading(true);
    try {
      await aiInterviewService.delete(config.id);
      toast.success('Config deleted');
      onBack();
    } catch (error: any) {
      toast.error(friendlyErrorMessage(error, "Couldn't delete AI interview. Please try again."));
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  // One flat table — a Section column replaces the old CSV's stacked blocks so
  // the same rows work as CSV or .xlsx.
  const CONFIG_EXPORT_HEADERS = ['Section', '#', 'Cluster / Question', 'Priority', 'Skill', 'Description / Reason', 'Answer Type', 'Stage'];

  const buildConfigExportRows = (): string[][] => {
    const rows: string[][] = [];
    const PRIORITY_LABEL: Record<number, string> = { 3: 'High', 2: 'Medium', 1: 'Low' };

    // Helper: write clusters with one skill per row (first skill row shows cluster info, rest blank)
    const writeClusters = (section: string, clusters: typeof mthClusters, emptyLabel: string) => {
      if (clusters.length === 0) {
        rows.push([section, '-', emptyLabel, '', '', '', '', '']);
        return;
      }
      clusters.forEach((c, i) => {
        const skills = c.skills?.length ? c.skills : ['(no skills)'];
        skills.forEach((skill, si) => {
          rows.push([
            section,
            si === 0 ? String(i + 1) : '',
            si === 0 ? c.name : '',
            si === 0 ? (PRIORITY_LABEL[c.priority] ?? String(c.priority)) : '',
            skill,
            si === 0 ? (c.reason ?? '') : '',
            '',
            '',
          ]);
        });
      });
    };

    writeClusters('Must-Have Skill Clusters', mthClusters, 'No clusters configured');
    writeClusters('Nice-to-Have Skill Clusters', nthClusters, 'No clusters configured or NTH disabled');

    // ── HR Questions ──
    const hrQuestions = hrRound?.hr_questions ?? [];
    if (hrQuestions.length > 0) {
      hrQuestions.forEach((q, i) => {
        rows.push([
          'HR Round Questions',
          String(i + 1),
          q.question_text ?? '',
          '',
          '',
          '',
          q.answer_type ?? 'text',
          q.stage === 'opening' ? 'opening' : 'closing',
        ]);
      });
    } else {
      rows.push(['HR Round Questions', '-', 'No HR questions configured or HR round disabled', '', '', '', '', '']);
    }
    return rows;
  };

  const handleExport = async (format: ExportFileFormat) => {
    if (!canExportAIInterviews) return;
    const title = config.jd_title || config.position || 'AI Interview';
    const displayId = config.display_id || config.id;
    await exportRows(format, CONFIG_EXPORT_HEADERS, buildConfigExportRows(), `${displayId}-clusters-hr`, {
      sheetName: 'Clusters & HR',
      title: `AI Interview Export — ${displayId} - ${title}`,
    });
    toast.success(format === 'xlsx' ? 'Exported to Excel' : 'Exported to CSV');
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

  /* The open candidate rides in the URL (`?candidate=<session id>`), written
     with replaceState like the tab, so a refresh or a shared link reopens the
     same result with its trail. Not in the embedded Configure-only render. */
  const setCandidateParam = useCallback((sessionId: string | null) => {
    if (configureOnly || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (sessionId) params.set('candidate', sessionId);
    else params.delete('candidate');
    const qs = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, [configureOnly]);
  useEffect(() => {
    if (configureOnly) return;
    const sessionId = new URLSearchParams(window.location.search).get('candidate');
    if (!sessionId) return;
    let cancelled = false;
    aiInterviewService.get(sessionId)
      .then((detail) => { if (!cancelled) setCandidateDetail(detail); })
      .catch(() => { if (!cancelled) setCandidateParam(null); });
    return () => { cancelled = true; };
  }, [configureOnly, setCandidateParam]);

  const handleCandidateClick = useCallback(async (activityId: string, navIds?: string[]) => {
    if (navIds) setCandidateNavIds(navIds);
    setCandidateLoading(true);
    try {
      const detail = await aiInterviewService.get(activityId);
      setCandidateDetail(detail);
      setCandidateParam(detail?.id || activityId);
    } catch (error: any) {
      toast.error(friendlyErrorMessage(error, "Couldn't load candidate details. Please try again."));
    } finally {
      setCandidateLoading(false);
    }
  }, [setCandidateParam]);

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
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${config.environment_verification_enabled ? 'bg-brand-blue/10 ring-1 ring-brand-blue/20' : 'bg-gray-100 ring-1 ring-gray-200'}`}>
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
                      should size to its content, not the shell's 400px min-height.
                      Below sm the 420px floor is dropped, the cells tighten and
                      nothing wraps, so the four short columns fit (or barely
                      scroll) on a phone instead of breaking "Must-To-/Have". */}
                  <div className="overflow-x-auto rounded-lg border border-gray-100 ring-1 ring-black/[0.02]">
                    <table className="w-full sm:min-w-[420px] text-sm whitespace-nowrap">
                      <thead>
                        <tr className="bg-white text-left border-b border-gray-100">
                          <th className="px-2 sm:px-4 py-2.5 font-semibold text-gray-600 text-xs">Round</th>
                          <th className="px-2 sm:px-4 py-2.5 font-semibold text-gray-600 text-right text-xs">Questions</th>
                          <th className="px-2 sm:px-4 py-2.5 font-semibold text-gray-600 text-right text-xs">Clusters</th>
                          <th className="px-2 sm:px-4 py-2.5 font-semibold text-gray-600 text-right text-xs">Time</th>
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
                              <td className="px-2 sm:px-4 py-2.5 text-gray-900">{label}</td>
                              <td className="px-2 sm:px-4 py-2.5 text-gray-700 text-right">{questions}</td>
                              <td className="px-2 sm:px-4 py-2.5 text-gray-700 text-right">{clusterCount !== null ? clusterCount : '—'}</td>
                              <td className="px-2 sm:px-4 py-2.5 text-gray-700 text-right">{mins} min</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 font-semibold border-t border-gray-100">
                          <td className="px-2 sm:px-4 py-2.5 text-gray-900">Total</td>
                          <td className="px-2 sm:px-4 py-2.5 text-gray-900 text-right">
                            {enabledRounds.reduce((s, r) => s + (timedPreviewQuestions[r.type] ?? r.planned_questions ?? 0), 0)}
                          </td>
                          <td className="px-2 sm:px-4 py-2.5 text-gray-900 text-right">{mthClusters.length + nthClusters.length}</td>
                          <td className="px-2 sm:px-4 py-2.5 text-gray-900 text-right">
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
                              hrQuestions={(hrRound?.hr_questions as AIInterviewHRQuestion[] | undefined) ?? []}
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
                        {/* Star icons as on the Assessment Details page's
                            Must-Have / Nice-to-Have Skills headings. */}
                        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-brand-blue uppercase tracking-wide mb-3">
                          <Star className="w-4 h-4 text-brand-blue" aria-hidden="true" />
                          Must-To-Have Clusters
                        </h4>
                        <div className="space-y-3">
                          {mthClusters.map(cluster => (
                            <div key={cluster.id} className="border border-gray-100 ring-1 ring-black/[0.02] rounded-lg p-4 bg-white shadow-sm shadow-brand-blue/5 hover:ring-brand-blue/20 transition-shadow">
                              <div className="flex items-center gap-2 mb-2">
                                <PriorityBadge p={cluster.priority} />
                                <span className="min-w-0 text-sm font-semibold text-gray-900 [overflow-wrap:anywhere]">{cluster.name}</span>
                                <span className="text-xs text-gray-400 ml-auto flex-shrink-0 whitespace-nowrap">{cluster.skills.length} skill{cluster.skills.length !== 1 ? 's' : ''}</span>
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
                        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-brand-cyan uppercase tracking-wide mb-3">
                          <Star className="w-4 h-4 text-brand-cyan" aria-hidden="true" />
                          Nice-To-Have Clusters
                        </h4>
                        <div className="space-y-3">
                          {nthClusters.map(cluster => (
                            <div key={cluster.id} className="border border-gray-100 ring-1 ring-black/[0.02] rounded-lg p-4 bg-white shadow-sm shadow-brand-blue/5 hover:ring-brand-cyan/20 transition-shadow">
                              <div className="flex items-center gap-2 mb-2">
                                <PriorityBadge p={cluster.priority} />
                                <span className="min-w-0 text-sm font-semibold text-gray-900 [overflow-wrap:anywhere]">{cluster.name}</span>
                                <span className="text-xs text-gray-400 ml-auto flex-shrink-0 whitespace-nowrap">{cluster.skills.length} skill{cluster.skills.length !== 1 ? 's' : ''}</span>
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
    const backToInterview = () => { setCandidateDetail(null); setCandidateParam(null); };
    const interviewLabel = config.jd_title || config.position || 'Interview Details';
    const candidateLabel = candidateDetail.candidate_name || 'Candidate Results';
    return (
      <CandidateResultsView
        interview={candidateDetail}
        tabInUrl={false}
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
      {jdDisabled && (
        <div role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span>{JD_DISABLED_ACTION_MESSAGE} You can still view its details and results.</span>
        </div>
      )}
      <div className="mb-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-brand-blue/30 dark:border-brand-blue/40 ring-1 ring-brand-blue/10 dark:ring-brand-blue/20 shadow-sm shadow-brand-blue/10 p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
            <div {...draftLockProps} className={`flex-1 min-w-0 ${draftLockProps.className}`}>
              {/* Row 1: JD-151  Title  Status. The JD ID leads, in the badge
                  every list uses for it — it replaced the AI-### interview id
                  here, and with it the "Linked to JD-###" fact below. */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {config.jd_short_id && (
                  <JobIdBadge className="flex-shrink-0">{config.jd_short_id}</JobIdBadge>
                )}
                <h1 className="min-w-0 font-semibold text-gray-900 dark:text-slate-50 text-lg sm:text-xl truncate">
                  {config.jd_title || config.position || 'Untitled'}
                </h1>
                <Badge variant={getStatusVariant(config.status)}>{getStatusLabel(config.status)}</Badge>
                {/* Live, with saved edits waiting for Publish — this page shows the published version. */}
                {hasUnpublishedChanges(config) && <UnpublishedChangesChip />}
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
                        if (opening && jobVersionMenuRef.current) {
                          // Same measure as JobDetailView's version menu: w-72,
                          // capped like max-w below; 20px clear of the card edge.
                          const menuWidth = Math.min(288, window.innerWidth - 32);
                          const left = jobVersionMenuRef.current.getBoundingClientRect().left;
                          setJobVersionMenuShift(Math.min(0, window.innerWidth - 20 - (left + menuWidth)));
                        }
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
                        style={{ left: jobVersionMenuShift }}
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
                                      router.push(`/recruitment/ai-interviews/${linkedConfig.id}${originQuery}`);
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

                {/* Interview Version - this version's number within its
                    interview (V1 is the original, V2.. are duplicates). */}
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
                    if (jdDisabled) {
                      toast.error(JD_DISABLED_ACTION_MESSAGE);
                      return;
                    }
                    if (!canShareAIInterviews) return;
                    openInvite({
                      kind: 'interview',
                      job: config.jd_id
                        ? {
                            jdId: config.jd_id,
                            jdTitle: config.jd_title || config.position || '',
                            jdCode: config.jd_short_id,
                            versionNumber: config.jd_version,
                            status: jdDisabled ? 'Disabled' : config.jd_status,
                          }
                        : undefined,
                      versionId: config.id,
                      onSent: () => refreshAfterInviteRef.current(),
                    });
                  }}
                  aria-disabled={jdDisabled || !canShareAIInterviews}
                  className={jdDisabled || !canShareAIInterviews ? 'opacity-50 cursor-not-allowed' : ''}
                  title={jdDisabled ? JD_DISABLED_ACTION_MESSAGE : !canShareAIInterviews ? 'You do not have permission to invite candidates to an AI interview' : ''}
                  icon={<Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                >
                  Invite
                </Button>
              )}
              {/* Edit + Duplicate - the Assessment Details pair. Edit is open only
                  while nobody has been invited to THIS version; once someone
                  has, it is locked and Duplicate (which then opens up) makes
                  the next version. */}
              {config.status === 'published' && config.jd_id && (
                <>
                  {/* Archive, icon-only — the Assessment Details header's own
                      Archive button (same glyph, same shape, same place in
                      the row), offered here for the first time: archiving a
                      live AI interview used to be reachable only from the
                      list page's row menu. */}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={canArchiveAIInterviews ? () => setShowArchiveConfirm(true) : undefined}
                    disabled={actionLoading}
                    aria-disabled={!canArchiveAIInterviews}
                    aria-label="Archive AI interview"
                    title={canArchiveAIInterviews ? 'Archive this AI interview' : 'You do not have permission to archive AI interviews'}
                    className={`h-8 w-8 px-0 flex-shrink-0 ${canArchiveAIInterviews ? '' : 'opacity-50 cursor-not-allowed'}`}
                  >
                    <Archive className="w-4 h-4 text-menu-icon-archive" />
                  </Button>
                  {/* Duplicate, icon-only — no label, same icon-only shape as
                      Archive and Edit either side of it. */}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={duplicateBlockedReason ? undefined : handleDuplicate}
                    disabled={(!!duplicateBlockedReason && canCreateAIInterviews) || actionLoading}
                    aria-disabled={!!duplicateBlockedReason}
                    aria-label="Duplicate as a new version"
                    title={duplicateBlockedReason || 'Duplicate as a new version'}
                    className={`h-8 w-8 px-0 flex-shrink-0 ${!canCreateAIInterviews ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Copy className="w-4 h-4 text-menu-icon-download" />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={editBlockedReason ? undefined : () => router.push(withOrigin(aiInterviewConfigureHref(config.id, config.jd_id || '')))}
                    disabled={!!editBlockedReason && canUpdateAIInterviews}
                    aria-disabled={!!editBlockedReason}
                    aria-label="Edit AI interview"
                    title={editBlockedReason || 'Edit this version'}
                    className={`h-8 w-8 px-0 flex-shrink-0 ${!canUpdateAIInterviews ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Pencil className="w-4 h-4 text-menu-icon-edit" />
                  </Button>
                </>
              )}
              {config.status === 'draft' && config.jd_id && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    if (jdDisabled) {
                      toast.error(JD_DISABLED_ACTION_MESSAGE);
                      return;
                    }
                    if (!canUpdateAIInterviews) return;
                    // Resumes at the step the draft was left on.
                    router.push(withOrigin(aiInterviewDraftResumeHref(config)));
                  }}
                  aria-disabled={jdDisabled || !canUpdateAIInterviews}
                  title={jdDisabled ? JD_DISABLED_ACTION_MESSAGE : !canUpdateAIInterviews ? 'You do not have permission to edit AI interviews' : ''}
                  icon={<Pencil className="w-3.5 h-3.5 flex-shrink-0" />}
                  className={`gap-1.5 px-3 sm:px-4 min-h-[40px] text-sm ${jdDisabled || !canUpdateAIInterviews ? 'opacity-50 cursor-not-allowed' : ''} ${draftLocked ? 'ring-2 ring-brand-blue/40 shadow-md shadow-brand-blue/20' : ''}`}
                >
                  <span className="hidden sm:inline">Continue Editing</span>
                  <span className="sm:hidden">Edit</span>
                </Button>
              )}
              <div {...draftLockProps} className={draftLocked ? `flex items-center gap-2 ${draftLockProps.className}` : 'contents'}>
              {/* Archived: Invite, then Unarchive (no Refresh at any status). Invite
                  stays visible but disabled — Assessment Details' archived
                  header, where archived records cannot be shared. Same label
                  as the Active header and the list menu. */}
              {config.status === 'archived' && (
                <>
                <Button
                  variant="primary"
                  size="sm"
                  disabled
                  title="Archived interviews cannot be shared"
                  icon={<Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                >
                  Invite
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={canArchiveAIInterviews ? handleUnarchive : undefined}
                  disabled={actionLoading}
                  aria-disabled={jdDisabled || !canArchiveAIInterviews}
                  title={jdDisabled ? JD_DISABLED_ACTION_MESSAGE : !canArchiveAIInterviews ? 'You do not have permission to unarchive AI interviews' : ''}
                  icon={actionLoading ? <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" /> : <ArchiveRestore className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-menu-icon-archive" />}
                  className={`${jdDisabled || !canArchiveAIInterviews ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Unarchive
                </Button>
                </>
              )}
              </div>
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
      {/* A DRAFT: no tabs — just a short, greyed-out note in their place. */}
      {draftLocked && (
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-800/30 px-6 py-12 text-center opacity-70 select-none">
          <FileText className="w-8 h-8 text-gray-300 dark:text-slate-600 mx-auto mb-3" aria-hidden="true" />
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400">This AI interview is still a draft</p>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Details, invitations and results appear here once it&apos;s published.</p>
        </div>
      )}

      {/* A DRAFT shows only its header card (with Continue Editing) — no tabs
          or tab content until it is published. */}
      {!draftLocked && (
      <div className="space-y-3 sm:space-y-4 lg:space-y-0 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-4 xl:grid-cols-[260px_minmax(0,1fr)] xl:gap-6">
        {/* Tablet/mobile: horizontal pill tab bar (shared `tabPill` chrome,
            wrapping onto a second row so every tab stays visible). Desktop
            (lg+): a sticky vertical rail on the left, content on the right. */}
        <div className="lg:sticky lg:top-20 lg:self-start bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5">
          <nav className="p-2 sm:p-3" aria-label="Interview details sections">
            <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:flex-nowrap lg:items-stretch lg:gap-1.5">
              {([
                { key: 'overview', label: 'Interview Details', icon: FileText },
                { key: 'invites', label: 'Invitation Status', icon: Mail },
                { key: 'results', label: 'Results', icon: BarChart },
                { key: 'activity', label: 'Recent Activity', icon: Clock },
                { key: 'viewjd', label: 'View JD', icon: Briefcase },
                { key: 'versions', label: 'Version History', icon: Layers },
              ] as { key: typeof activeTab; label: string; icon: typeof FileText }[]).map((t) => {
                const isActive = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveTab(t.key)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`${tabPill(isActive)} whitespace-nowrap lg:flex lg:w-full lg:gap-2 lg:px-3 lg:py-2.5 lg:text-left lg:whitespace-normal lg:shadow-none ${
                      isActive
                        ? 'lg:bg-brand-blue/5 lg:text-brand-blue lg:font-medium lg:ring-1 lg:ring-brand-blue/20'
                        : 'lg:bg-transparent lg:text-gray-600 lg:dark:text-slate-400 lg:hover:bg-brand-blue/5 lg:hover:text-brand-blue'
                    }`}
                  >
                    <t.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    <span className="leading-snug lg:min-w-0">{t.label}</span>
                  </button>
                );
              })}
              {/* Go to JD — leaves the page. Tablet/mobile: after a divider at
                  the row's end. Desktop: under the rail, above a top rule. */}
              {config.jd_id && (
                <div className="flex items-center border-l border-gray-200 dark:border-slate-700/60 pl-2 ml-1 lg:border-l-0 lg:border-t lg:pl-0 lg:ml-0 lg:pt-2 lg:mt-1">
                  <button
                    type="button"
                    onClick={() => router.push(jobDetailsHref(config.jd_id!))}
                    className={`${tabPill(false)} whitespace-nowrap lg:w-full lg:justify-start lg:px-3 lg:py-2 lg:bg-transparent lg:font-medium lg:text-brand-blue lg:hover:bg-brand-blue/5 lg:hover:underline lg:underline-offset-2`}
                  >
                    Go to JD
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </nav>
        </div>

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
                  {config.jd_stale_reason ?? 'The underlying Job Description was updated after this config was created'}
                  .{' '}Candidates who take this interview will be evaluated against the snapshotted skills, not the current JD.
                </p>
                {config.status === 'draft' && config.jd_id && (
                  <button
                    type="button"
                    onClick={() => {
                      const url = `/recruitment/ai-interviews/jd-selection/ai-interview-config?jd_id=${config.jd_id}&config_id=${config.id}`;
                      router.push(withOrigin(url));
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
              <div className="flex items-start justify-between gap-3">
                <TabHeading icon={FileText} title="Interview Details" />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { if (canExportAIInterviews) setShowExportModal(true); }}
                  title={canExportAIInterviews ? 'Export clusters & HR questions' : 'You do not have permission to export AI interviews'}
                  aria-label="Export"
                  aria-disabled={!canExportAIInterviews || undefined}
                  className={`px-2 min-w-[40px] min-h-[40px] flex-shrink-0 ${canExportAIInterviews ? '' : 'opacity-50 cursor-not-allowed'}`}
                >
                  <Download className="w-4 h-4" />
                </Button>
                <ExportFormatModal
                  open={showExportModal}
                  onClose={() => setShowExportModal(false)}
                  title="Export Clusters & HR Questions"
                  recordCount={showExportModal ? buildConfigExportRows().length : undefined}
                  columns={CONFIG_EXPORT_HEADERS}
                  onExport={handleExport}
                />
              </div>

              {/* Interview Details' own sub-tabs — Configure Details (this
                  tab's original content) and Interview Info (folded in from
                  the sidebar's former "AI Interview Info" item). */}
              {/* The Assessment Details page's own inner tabs, so the two
                  details pages read alike: separate icon pills, the active one
                  on a light brand-blue ground with a ring. */}
              <div
                role="tablist"
                aria-label="Interview details views"
                className="flex flex-wrap items-center gap-2"
              >
                {([
                  { key: 'configure', label: 'Configure Details', icon: Sliders },
                  { key: 'info', label: 'Interview Info', icon: Info },
                ] as const).map((tab) => {
                  const isActive = detailsSubTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setDetailsSubTab(tab.key)}
                      className={`rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors inline-flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-brand-blue/5 text-brand-blue font-medium ring-1 ring-brand-blue/20'
                          : 'text-gray-600 dark:text-slate-400 hover:bg-brand-blue/5 hover:text-brand-blue'
                      }`}
                    >
                      <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                      <span className="leading-snug">{tab.label}</span>
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
                      <p className="text-sm text-gray-600">Metadata from the job description used to configure this interview</p>
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


          {/* Recent Activity Tab — the Job Description page's Recent Activity
              panel for this interview: every event its own row (a coloured
              dot, the title, a Clock-tagged date/time and a User-tagged name),
              merged and sorted newest first, ten to a page. */}
          {activeTab === 'activity' && (() => {
            interface ActivityEvent { key: string; dot: string; title: string; date?: string; by?: string; sessionId?: string }
            const events: ActivityEvent[] = [];

            const LIFECYCLE_DOT: Record<string, string> = {
              config_created: 'bg-brand-blue',
              config_published: 'bg-success',
              config_republished: 'bg-purple-500',
              config_updated: 'bg-purple-500',
              config_archived: 'bg-brand-orange',
              config_unarchived: 'bg-brand-teal',
              config_restored: 'bg-brand-teal',
              config_enabled: 'bg-success',
              config_disabled: 'bg-destructive',
              config_deleted: 'bg-destructive',
            };
            (lifecycleEvents || []).forEach((e) => {
              events.push({
                key: `life-${e.id}`,
                dot: LIFECYCLE_DOT[e.activity_type] || 'bg-gray-400',
                title: e.title || e.activity_type.replace(/^config_/, 'Interview ').replace(/_/g, ' '),
                date: e.timestamp,
                by: e.actor_name,
              });
            });
            // The creation row, when the audit trail has none for it.
            if (lifecycleEvents && !lifecycleEvents.some((e) => e.activity_type === 'config_created')) {
              events.push({ key: 'created', dot: 'bg-brand-blue', title: 'AI Interview Created', date: config.created_at, by: config.created_by_name });
            }

            recentActivity.forEach((inv: any) => {
              const who = inv.candidate_name || inv.candidate_email || 'Candidate';
              const base = { sessionId: inv.id, by: inv.invited_by_name || inv.created_by_name };
              events.push({ ...base, key: `inv-${inv.id}`, dot: 'bg-indigo-500', title: `Candidate Invited - ${who}`, date: inv.invitation_sent_at || inv.created_at });
              if (inv.started_at) events.push({ key: `start-${inv.id}`, sessionId: inv.id, by: who, dot: 'bg-brand-orange', title: `Interview Started - ${who}`, date: inv.started_at });
              if (inv.completed_at) {
                const terminated = inv.status === 'terminated';
                events.push({
                  key: `done-${inv.id}`, sessionId: inv.id, by: who,
                  dot: terminated ? 'bg-destructive' : 'bg-success',
                  title: `${terminated ? 'Interview Terminated' : 'Interview Completed'} - ${who}`,
                  date: inv.completed_at,
                });
              }
              if (inv.status === 'revoked') events.push({ ...base, key: `revoke-${inv.id}`, dot: 'bg-destructive', title: `Invitation Revoked - ${who}`, date: inv.revoked_at || inv.updated_at });
              if (inv.status === 'expired') events.push({ key: `expire-${inv.id}`, sessionId: inv.id, dot: 'bg-orange-500', title: `Invitation Expired - ${who}`, date: inv.expires_at, by: 'System' });
            });

            const sortTime = (e: { date?: string }) => (e.date ? new Date(e.date).getTime() : 0);
            events.sort((a, b) => sortTime(b) - sortTime(a));

            const ACTIVITY_PAGE_SIZE = 10;
            const totalPages = Math.max(1, Math.ceil(events.length / ACTIVITY_PAGE_SIZE));
            const safePage = Math.min(activityPage, totalPages);
            const pageEvents = events.slice((safePage - 1) * ACTIVITY_PAGE_SIZE, safePage * ACTIVITY_PAGE_SIZE);
            const sessionIds = recentActivity.map((a: any) => a.id);
            const loading = activityLoading || lifecycleEvents === null;

            return (
              <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 sm:p-6">
                <TabHeading icon={Clock} title="Recent Activity" />
                {loading && events.length === 0 ? (
                  <div className="space-y-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="flex gap-3">
                        <Skeleton className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-4 w-56" />
                          <Skeleton className="h-3 w-40" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : events.length === 0 ? (
                  <div className="text-sm text-gray-500 italic">No recent activity</div>
                ) : (
                  <div className="space-y-3">
                    {pageEvents.map((e) => {
                      const body = (
                        <>
                          <div className={`w-2 h-2 ${e.dot} rounded-full mt-1.5 flex-shrink-0`} />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-gray-900 truncate">{e.title}</div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" strokeWidth={1.75} />
                                {e.date ? formatIST(e.date) : 'N/A'}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <UserIcon className="w-3 h-3" strokeWidth={1.75} />
                                {e.by || 'System'}
                              </span>
                            </div>
                          </div>
                          {e.sessionId && <ChevronRight className="w-4 h-4 text-brand-blue flex-shrink-0 mt-0.5" />}
                        </>
                      );
                      return e.sessionId ? (
                        <button
                          key={e.key}
                          type="button"
                          onClick={() => handleCandidateClick(e.sessionId!, sessionIds)}
                          className="w-full flex gap-3 text-left rounded-lg -mx-2 px-2 py-1 hover:bg-brand-blue/5 transition-colors"
                        >
                          {body}
                        </button>
                      ) : (
                        <div key={e.key} className="flex gap-3 px-0 py-1">{body}</div>
                      );
                    })}
                    {events.length > ACTIVITY_PAGE_SIZE && (
                      <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-2 text-xs text-gray-500">
                        <span className="tabular-nums">
                          {(safePage - 1) * ACTIVITY_PAGE_SIZE + 1}–{Math.min(safePage * ACTIVITY_PAGE_SIZE, events.length)} of {events.length}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setActivityPage(safePage - 1)}
                            disabled={safePage <= 1}
                            aria-label="Previous activity page"
                            className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue disabled:opacity-40 disabled:pointer-events-none transition-colors"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-1.5 tabular-nums text-gray-700">
                            <span className="font-semibold text-brand-blue">{safePage}</span> / {totalPages}
                          </span>
                          <button
                            type="button"
                            onClick={() => setActivityPage(safePage + 1)}
                            disabled={safePage >= totalPages}
                            aria-label="Next activity page"
                            className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue disabled:opacity-40 disabled:pointer-events-none transition-colors"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Version History Tab — every interview version created for THIS
              job version, as the Assessments page's Version History lists an
              assessment's versions: V1 is the original, the rest re-authored
              against the same job version. The one open here is marked. */}
          {activeTab === 'versions' && (
            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 tf-round-edges">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                <div className="flex flex-wrap items-center gap-2.5 mb-1">
                  <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                    <Layers className="w-4 h-4 text-brand-blue" />
                  </div>
                  <h2 className="text-base font-semibold text-gray-900 tracking-tight">Version History</h2>
                  {config.jd_id && (
                    <span className="text-2xs text-gray-500">Job V{config.jd_version ?? 1}</span>
                  )}
                </div>
                <p className="text-sm text-gray-600">
                  {config.jd_id
                    ? `Every interview version created for Job V${config.jd_version ?? 1} (V1 is the original).`
                    : 'All versions of this interview (V1 is the original).'}
                </p>
              </div>
              {!config.jd_id ? (
                <div className="px-6 py-12 text-center">
                  <Layers className="w-12 h-12 text-brand-blue/30 mx-auto mb-3" />
                  <p className="text-gray-600 mb-1 text-sm">No linked job version</p>
                  <p className="text-sm text-gray-500">Interview versions are grouped by the job version they were created for</p>
                </div>
              ) : jobVersionInterviews.length === 0 ? (
                <div className="p-6 space-y-4">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="rounded-xl border border-gray-100 bg-white p-4 ring-1 ring-black/[0.02]">
                      <div className="flex items-start gap-4">
                        <Skeleton className="w-12 h-12 rounded-full flex-shrink-0" />
                        <div className="flex-1 min-w-0 space-y-2">
                          <Skeleton className="h-5 w-56" />
                          <Skeleton className="h-4 w-full max-w-md" />
                          <Skeleton className="h-4 w-full max-w-sm" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 space-y-4">
                  {jobVersionInterviews.map((version, idx) => {
                    const isThis = version.id === config.id;
                    const versionNumber = idx + 1;
                    const statusRaw = String(version.status || '').toLowerCase();
                    const isLive = ['published', 'invited', 'consent_pending', 'system_check', 'in_progress', 'scheduled'].includes(statusRaw);
                    const statusLabel = isLive ? 'Active' : getStatusLabel(statusRaw) || 'Draft';
                    const statusChipClass = isLive
                      ? 'bg-success-subtle text-success-strong ring-1 ring-success-line'
                      : statusRaw === 'archived'
                      ? 'bg-gray-100 text-gray-700 ring-1 ring-gray-200'
                      : statusRaw === 'completed'
                      ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-200'
                      : 'bg-warning-subtle text-warning-strong ring-1 ring-warning-line';
                    const rounds = (version.rounds_config || [])
                      .filter((r: any) => r.enabled !== false)
                      .map((r: any) => ROUND_LABELS[r.type] || r.type)
                      .join(', ') || '—';
                    const mode = modeFromConfig(version.special_instructions, version.duration_minutes) === 'fixed' ? 'Timed' : 'Conversational';
                    const completed = versionCompleted[version.id];

                    return (
                      <div
                        key={version.id}
                        className={`rounded-xl border p-4 ring-1 ring-black/[0.02] ${
                          isThis ? 'border-brand-blue/40 bg-brand-blue/5' : 'border-gray-100 bg-white'
                        }`}
                      >
                        {/* Below sm: a smaller badge and gap, and the title and
                            facts wrap instead of truncating — between the V-badge
                            and the eye button the text column is ~150px on a
                            phone, which cut every line to a few characters. */}
                        <div className="flex items-start gap-3 sm:gap-4">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-brand-cyan shadow-sm shadow-brand-cyan/25 ring-1 ring-white/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-white font-bold text-sm">V{versionNumber}</span>
                          </div>
                          <div className="@container flex-1 min-w-0">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 mb-1.5">
                              <h4 className="min-w-0 text-base font-semibold text-gray-900 tracking-tight [overflow-wrap:anywhere] sm:truncate">
                                {version.jd_title || version.position || 'Interview'} - Version {versionNumber}
                              </h4>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${statusChipClass}`}>
                                  {statusLabel}
                                </span>
                                {isThis && (
                                  <span className="inline-flex items-center px-2 py-0.5 bg-brand-blue text-white shadow-sm shadow-brand-blue/25 text-xs font-medium rounded-full whitespace-nowrap">
                                    Viewing
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 @md:grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-700 mt-2">
                              <div className="flex flex-wrap sm:flex-nowrap items-center gap-x-1.5 min-w-0">
                                <Users className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                                <span className="shrink-0">Created by</span>
                                <span className="font-medium min-w-0 [overflow-wrap:anywhere] sm:truncate">{version.created_by_name || 'Unknown'}</span>
                              </div>
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Calendar className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                                <span className="min-w-0 sm:truncate">{version.created_at ? formatIST(version.created_at) : '—'}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                                <span>{version.duration_minutes || 30} min · {mode}</span>
                              </div>
                              <div className="flex items-start sm:items-center gap-1.5 min-w-0">
                                <FileText className="w-3.5 h-3.5 mt-0.5 sm:mt-0 text-gray-500 flex-shrink-0" />
                                <span className="min-w-0 sm:truncate">{rounds}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Mail className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                                <span>{version.invitations_count || 0} invited</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <CheckCircle className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                                <span>{completed == null ? '—' : completed} completed</span>
                              </div>
                            </div>
                          </div>

                          {/* Preview this version's configuration, read-only. */}
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setPreviewVersionId(version.id)}
                            title="Preview configure settings"
                            aria-label={`Preview configure settings for Version ${versionNumber}`}
                            className="h-8 w-8 px-0 flex-shrink-0"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {previewVersionId && (
                <ConfigurePreviewDialog configId={previewVersionId} onClose={() => setPreviewVersionId(null)} />
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
                      onClick={() => router.push(jobDetailsHref(jdFullData.id))}
                      className="inline-flex items-center gap-1.5 text-sm text-brand-blue hover:text-brand-blue-2 transition-colors"
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
                readOnly={jdDisabled}
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
              jdDisabled={jdDisabled}
              configArchived={isInterviewConfigArchived(config.status)}
              hideVersionDetails
              // Resend / revoke / edit here also change the activity list and
              // the header's invite counts — refresh both at once.
              onChanged={async () => { await Promise.all([loadActivity(), onRefresh?.()]); }}
              refreshSignal={inviteRefreshTick}
              // Completed rows offer View Result — swap the popup for the
              // same inline candidate result view the Results tab opens.
              onViewResult={(inv) => handleCandidateClick(inv.id)}
            />
          )}

        </div>
      </div>
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

      {/* Archive confirm — the same dedicated component the AI Interviews
          list uses for this action, so the warning cannot drift between the
          two surfaces. */}
      <ArchiveAIInterviewModal
        isOpen={showArchiveConfirm}
        title={`${config.jd_title || config.position || 'Untitled'} - AI Interview`}
        version={interviewVersionOrdinal}
        createdAt={config.created_at}
        totalQuestions={config.total_questions}
        durationMinutes={config.duration_minutes}
        isLoading={actionLoading}
        jdDisabled={jdDisabled}
        onConfirm={async () => {
          await handleArchive();
          setShowArchiveConfirm(false);
        }}
        onCancel={() => setShowArchiveConfirm(false)}
      />
        </div>
      </div>
    </main>
  );
}
