'use client';

import { handoffContinueLabel, resolveInviteHandoffOrigin, useHandoffCandidateCrumb } from '@/lib/utils/resumeScoringInviteHandoff';
import React, { useState, useEffect, useCallback } from 'react';
import { useEmbeddedWizard, useWizardRouter, useWizardSearchParams, WizardLayer } from './embeddedWizardNav';
import {
  ArrowLeft, CheckCircle2, Loader2, Clock, Shield, Users,
  Brain, Video, Globe, Timer, Layers, Settings,
  ChevronRight, ChevronDown, CheckCircle, ClipboardList, Mic, Pencil, Play, Eye,
  Share2, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import { aiInterviewService, isJdDisabled, JD_DISABLED_ACTION_MESSAGE } from '@/lib/services/aiInterviewService';
import { Button } from '@/components/ui/button';
import type {
  AIInterviewResponse,
  AIInterviewRoundConfig,
  AIInterviewHRQuestion,
} from '@/lib/services/aiInterviewService';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getPriorityLabel } from '@/lib/constants/aiInterviewPriority';
import { modeFromDuration } from '@/lib/constants/aiInterviewMode';
import { AIInterviewStepIndicator, useBreadcrumbOffset } from './AIInterviewStepIndicator';
import WizardDiscardButton from './WizardDiscardButton';
import { isUnsavedVersion } from '@/lib/utils/aiInterviewDraftResume';
import {
  clearStaging, endEditSession, hasPendingThisVisit, markStaging, shouldAnnounceRestoredEdits,
} from '@/lib/utils/aiInterviewEditSession';
import { discardWizardChanges, keepWizardChanges } from '@/lib/utils/aiInterviewWizardExit';
import { formatIST } from '@/lib/utils/dateUtils';
import { WizardLeavePrompt } from './LeaveInterviewDialog';
import InterviewEditLockGate from './InterviewEditLockGate';
import { useInterviewLeaveGuard } from './useInterviewLeaveGuard';
import AIInterviewFlowLoader from './AIInterviewFlowLoader';
import { SectionHeader, SummaryLocation } from './ConfigSummary';
import { useJdLocations } from '@/hooks/useJdLocations';
import { QuestionDistributionPopover } from './QuestionDistributionPopover';
import { distributeSkillsLocally } from '@/lib/utils/questionDistribution';
import JobOpeningSummary from '@/components/jobs/JobOpeningSummary';
import JDFullViewModal from '@/components/jobs/JDFullViewModal';
import { useInviteDialog } from '@/components/talent-match-invite/InviteDialogProvider';
import SuccessAnimation from '@/components/ui/success-animation';
import type { Job } from '@/lib/types/types';
import { formatIndustryType } from '@/lib/utils/jobOpeningDisplay';
import { stripVersionFromTitle } from '@/lib/utils/assessmentUtils';
import { resolveAIInterviewVersion } from '@/lib/utils/aiInterviewJobOrder';
import PublishedSummaryCard, { PublishedActions } from '@/components/ui/published-summary-card';
import { getSttModelOption } from '@/lib/constants/aiInterviewSttModels';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { useAuth } from '@/components/providers/AuthProvider';

/* ─────────────────────────────────────────────────────────────────────── */
/*  Types                                                                  */
/* ─────────────────────────────────────────────────────────────────────── */

interface Cluster {
  id: string;
  name: string;
  priority: 1 | 2 | 3 | 4 | 5;
  skills: string[];
  reason?: string;
}

interface ParsedInstructions {
  mth_clusters?: Cluster[];
  nth_clusters?: Cluster[];
  skill_weights?: Record<string, 'high' | 'medium' | 'low'>;
  interview_mode?: 'fixed' | 'flexible';
  buffer_enabled?: boolean;
  [key: string]: unknown;
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Constants                                                               */
/* ─────────────────────────────────────────────────────────────────────── */

const CURRENT_STEP = 4 as const;

function getTimedModeAllocation(nthEnabled: boolean, hrEnabled: boolean) {
  if (!nthEnabled && !hrEnabled) {
    return {
      mthMinutes: 30,
      nthMinutes: 0,
      hrMinutes: 0,
      mthQuestions: 15,
      nthQuestions: 0,
      hrQuestions: 0,
    };
  }

  if (nthEnabled && !hrEnabled) {
    return {
      mthMinutes: 20,
      nthMinutes: 10,
      hrMinutes: 0,
      mthQuestions: 10,
      nthQuestions: 5,
      hrQuestions: 0,
    };
  }

  if (nthEnabled && hrEnabled) {
    return {
      mthMinutes: 16,
      nthMinutes: 8,
      hrMinutes: 6,
      mthQuestions: 8,
      nthQuestions: 4,
      hrQuestions: 3,
    };
  }

  return {
    mthMinutes: 20,
    nthMinutes: 0,
    hrMinutes: 10,
    mthQuestions: 10,
    nthQuestions: 0,
    hrQuestions: 5,
  };
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

  return { mth, nth, hr };
}

// Priority labels are imported from lib/constants/aiInterviewPriority (P1-P3 scale).

/* ─────────────────────────────────────────────────────────────────────── */
/*  Helper sub-components                                                   */
/* ─────────────────────────────────────────────────────────────────────── */

function PriorityBadge({ p }: { p: number }) {
  const { label, color } = getPriorityLabel(p);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-2xs font-medium rounded-full border ${color}`}>
      {label}
    </span>
  );
}

/**
 * One reviewable part of the configuration.
 *
 * Collapsible, because this page is a single long scroll of everything the
 * previous three steps produced — a recruiter checking one thing should be
 * able to fold away the rest. `action` carries the card's own way back to the
 * step that owns it, so "this is wrong" has an answer on the row itself.
 */
function SectionCard({
  title,
  icon: Icon,
  badge,
  action,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 sm:px-5 py-3.5 border-b border-gray-100 bg-slate-50/60">
        <div className="w-10 h-10 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-brand-blue" />
        </div>
        <h3 className="min-w-0 break-words text-sm font-semibold text-gray-800 tracking-tight">{title}</h3>
        {badge}
        <div className="ml-auto flex items-center gap-2">
          {action}
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            title={open ? `Hide ${title}` : `Show ${title}`}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-brand-blue hover:bg-brand-blue/5 transition-colors"
          >
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>
      {open && <div className="p-4 sm:p-5">{children}</div>}
    </div>
  );
}

/** "This is wrong" → the step that can fix it. */
function EditInConfigureButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-brand-blue border border-brand-blue/30 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue transition-colors"
    >
      <Pencil className="w-3.5 h-3.5" />
      Edit
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="tf-body-muted flex-shrink-0">{label}</span>
      <span className="min-w-0 break-words text-sm font-medium text-gray-900 text-right">{value}</span>
    </div>
  );
}

function HRQuestionStageBadge({ stage }: { stage?: string }) {
  const normalized = stage === 'opening' ? 'opening' : 'closing';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold uppercase tracking-wide ${
      normalized === 'opening'
        ? 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20'
        : 'bg-advice-positive-bg text-advice-positive ring-1 ring-advice-positive/25'
    }`}>
      {normalized}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Main component                                                          */
/* ─────────────────────────────────────────────────────────────────────── */

export default function AIInterviewPreview() {
  const router = useWizardRouter();
  /* Run inside the Create / Send AI Interview popup (AIInterviewWizardDialog). */
  const wizardNav = useEmbeddedWizard();
  const embedded = !!wizardNav;
  /* Step indicator pins below the sticky breadcrumb rather than under it. */
  const [breadcrumbBarRef, breadcrumbHeight] = useBreadcrumbOffset();
  const { isTenantAdmin, hasPermissionCode } = useAuth();
  const canPublishAIInterview = isTenantAdmin || hasPermissionCode('ai_interview:publish');
  const canInviteAIInterview = isTenantAdmin || hasPermissionCode('ai_interview:invite');
  const searchParams = useWizardSearchParams();
  const id = searchParams.get('id') || '';
  // Carried from Clusters when the flow started on a JD's Job Details page, so
  // stepping back keeps that page's breadcrumb instead of dropping to the
  // AI Interviews trail.
  const fromJobDetails = searchParams.get('from') === 'job-details';
  // Entered from Resume Scoring's / AI Talent Match's Actions › "Create AI
  // Interview" (the job had none to invite to): the trail starts at that
  // page, the origin rides every step, and publishing leads straight back
  // there to invite.
  const inviteOrigin = resolveInviteHandoffOrigin(searchParams.get('from'), searchParams.get('returnUrl'));
  const fromInviteOrigin = !!inviteOrigin;
  const inviteOriginReturn = inviteOrigin?.returnUrl ?? '';
  const inviteOriginLabel = inviteOrigin?.label ?? '';
  const inviteOriginPath = inviteOrigin?.path ?? '';
  // Started from one candidate's page: the trail names that candidate.
  const candidateCrumb = useHandoffCandidateCrumb();
  const inviteOriginQuery = inviteOrigin?.query ?? '';
  const originParam = (fromJobDetails ? '&from=job-details' : '') + inviteOriginQuery;

  /* State */
  const [loading, setLoading] = useState(true);
  const [interview, setInterview] = useState<AIInterviewResponse | null>(null);
  const [rounds, setRounds] = useState<AIInterviewRoundConfig[]>([]);
  const [mthClusters, setMthClusters] = useState<Cluster[]>([]);
  const [nthClusters, setNthClusters] = useState<Cluster[]>([]);
  const [skillWeights, setSkillWeights] = useState<Record<string, 'high' | 'medium' | 'low'>>({});
  const [interviewMode, setInterviewMode] = useState<'fixed' | 'flexible'>('fixed');
  const [bufferEnabled, setBufferEnabled] = useState<boolean>(false);
  /* Which speech-to-text engine Configure picked — named in the overview so
     the review covers what the candidate will actually be transcribed by. */
  const [sttModel, setSttModel] = useState<string | undefined>(undefined);
  const [publishing, setPublishing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  /* The intro video opens in a dialog from the Settings row. */
  const [showVideoPreview, setShowVideoPreview] = useState(false);
  /* The JD opens in a dialog from its card — reading it is a check made
     WHILE reviewing, and leaving the flow to make it would drop the review. */
  const [jdViewOpen, setJdViewOpen] = useState(false);
  /* Flipped by a successful publish: the page then shows the published
     screen in place of the review. */
  const [published, setPublished] = useState(false);
  // "Share Invite Link" opens THE invite popup (the one Assessments uses)
  // for this job and this interview version.
  const { open: openInvite } = useInviteDialog();
  /* This interview's own version (V1, V2..) for the published screen — the
     same sibling ordinal the All Interviews table shows, resolved once the
     publish lands. Undefined until then, and the row is left out. */
  const [interviewVersion, setInterviewVersion] = useState<number | undefined>(undefined);

  /* Load data */
  const loadInterview = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      // With pending edits overlaid: the review shows what the recruiter has
      // set up in this edit, not the config as it was last saved / published.
      const data = await aiInterviewService.get(id, { withPending: true });
      // A disabled JD's interview is view-only — no publishing or editing it
      // until the job is enabled again; show its read-only details instead.
      if (isJdDisabled(data.jd_status)) {
        toast.error(JD_DISABLED_ACTION_MESSAGE);
        if (wizardNav) wizardNav.exit();
        else router.replace(`/recruitment/ai-interviews/${data.id}`);
        return;
      }
      // An existing config (not one created in this visit) is edited as pending
      // edits — see lib/utils/aiInterviewEditSession.
      if (!isUnsavedVersion(data.id)) markStaging(data.id);
      if (shouldAnnounceRestoredEdits(data)) {
        toast.info(
          `Unsaved changes from ${formatIST(data.pending_edits_updated_at)} restored. Save as Draft to keep them, or Discard to drop them.`,
        );
      }
      setInterview(data);

      // Parse rounds_config
      if (data.rounds_config) {
        setRounds(data.rounds_config);
      }

      // Parse special_instructions JSON for clusters
      if (data.special_instructions) {
        try {
          const parsed: ParsedInstructions = JSON.parse(data.special_instructions);
          setMthClusters(parsed.mth_clusters ?? []);
          setNthClusters(parsed.nth_clusters ?? []);
          setSkillWeights(parsed.skill_weights ?? {});
          setInterviewMode(parsed.interview_mode === 'flexible' ? 'flexible' : 'fixed');
          setBufferEnabled(!!parsed.buffer_enabled);
          if (typeof parsed.stt_model === 'string') setSttModel(parsed.stt_model);
        } catch {
          setInterviewMode(modeFromDuration(data.duration_minutes));
        }
      } else {
        setInterviewMode(modeFromDuration(data.duration_minutes));
      }
    } catch {
      toast.error('Failed to load interview configuration');
    } finally {
      setLoading(false);
    }
  }, [id, router, wizardNav]);

  useEffect(() => {
    loadInterview();
  }, [loadInterview]);

  /* Only while this step is open does the service stage this config's saves. */
  useEffect(() => () => clearStaging(id), [id]);

  /* Derived values */
  const mode: 'fixed' | 'flexible' = interviewMode;
  const duration = interview?.duration_minutes ?? 30;
  const position = interview?.position ?? interview?.jd_title ?? 'Untitled Position';

  const interviewId = interview?.id;
  const interviewJdId = interview?.jd_id;
  useEffect(() => {
    if (!published || !interviewId) return;
    let cancelled = false;
    resolveAIInterviewVersion({ id: interviewId, jd_id: interviewJdId })
      .then((v) => { if (!cancelled) setInterviewVersion(v); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [published, interviewId, interviewJdId]);

  const mthRound = rounds.find(r => r.type === 'must_have_skills' || r.type === 'must_to_have' || r.type === 'technical');
  const nthRound = rounds.find(r => r.type === 'nice_to_have_skills' || r.type === 'nice_to_have');
  const hrRound = rounds.find(r => r.type === 'hr');

  const enabledRounds = rounds.filter(r => r.enabled);
  const timedAllocation = getTimedModeAllocation(!!(nthRound && nthRound.enabled), !!(hrRound && hrRound.enabled));
  const timedPreviewDurations = React.useMemo<Record<string, number>>(() => {
    if (mode !== 'fixed') return {};
    const map: Record<string, number> = {};
    if (mthRound?.enabled) map[mthRound.type] = timedAllocation.mthMinutes;
    if (nthRound?.enabled) map[nthRound.type] = timedAllocation.nthMinutes;
    if (hrRound?.enabled) map[hrRound.type] = timedAllocation.hrMinutes;
    return map;
  }, [mode, mthRound, nthRound, hrRound, timedAllocation]);
  const timedPreviewQuestions = React.useMemo<Record<string, number>>(() => {
    if (mode !== 'fixed') return {};
    const map: Record<string, number> = {};
    if (mthRound?.enabled) map[mthRound.type] = timedAllocation.mthQuestions;
    if (nthRound?.enabled) map[nthRound.type] = timedAllocation.nthQuestions;
    if (hrRound?.enabled) map[hrRound.type] = timedAllocation.hrQuestions;
    return map;
  }, [mode, mthRound, nthRound, hrRound, timedAllocation]);
  const languages = interview?.available_languages ?? (interview?.ai_voice_language ? [interview.ai_voice_language] : ['English']);
  const sttOption = getSttModelOption(sttModel);
  /* The JD as the Job Openings summary reads it. `experience` is the stored
     level ("mid") capitalised; `currentVersion` is left unset on purpose so
     the status reads "Published" rather than "Republished". */
  const jdLocations = useJdLocations(interview?.jd_id);
  const jdAsJob: Job = {
    id: interview?.jd_id ?? id,
    job_id: interview?.jd_short_id,
    title: interview?.jd_title ?? position,
    status: 'Published',
    location: interview?.jd_location ?? '',
    locations: jdLocations ?? undefined,
    daysActive: 0,
    requiredMatch: 0,
    industry_type: interview?.jd_industry_type,
    experience: interview?.jd_experience_level
      ? interview.jd_experience_level.charAt(0).toUpperCase() + interview.jd_experience_level.slice(1)
      : undefined,
    versionNumber: interview?.jd_version ?? undefined,
  };
  /* Configure owns everything the Settings and HR cards show, so their Edit
     goes there with this config loaded rather than to a dead end. */
  const editInConfigure = () => {
    if (publishing) return;
    if (interview?.jd_id) {
      router.push(
        `/recruitment/ai-interviews/jd-selection/ai-interview-config?jd_id=${encodeURIComponent(interview.jd_id)}&config_id=${id}${originParam}`,
      );
    } else {
      router.push('/recruitment/ai-interviews/jd-selection');
    }
  };
  /* "Technical + HR" or just "Technical": named from the rounds that are
     actually enabled rather than from the stored interview_type, which is the
     same string for every config this flow produces. */
  const interviewTypeLabel = hrRound?.enabled ? 'Technical + HR' : 'Technical';
  const totalPreviewQuestions = enabledRounds.reduce(
    (sum, r) => sum + (timedPreviewQuestions[r.type] ?? r.planned_questions ?? 0), 0,
  );
  const totalPreviewMinutes = enabledRounds.reduce(
    (sum, r) => sum + (timedPreviewDurations[r.type] ?? r.duration_minutes), 0,
  );

  /**
   * Where leaving this flow lands. A recruiter who started on a JD's Job
   * Details page — including via that page's draft prompt — came here to finish
   * one job's interview, so every exit returns them to that job rather than the
   * AI Interviews list they never chose to visit. The breadcrumb above already
   * points back there; this keeps the buttons agreeing with it.
   */
  const exitHref =
    fromJobDetails && interview?.jd_id
      ? `/recruitment/job-details?id=${encodeURIComponent(interview.jd_id)}`
      : null;
  /* Where "Go to AI Interviews" (and Back, once published — see below) land:
     the list, on the All Interviews tab, with this config flagged so that
     screen can scroll to and highlight the row it just created. */
  const listHref = fromInviteOrigin
    ? inviteOriginReturn
    : exitHref
    ? `${exitHref}&tab=ai-interview-results`
    : `/recruitment/ai-interviews?tab=all-interviews&highlight=${encodeURIComponent(id)}`;

  /* Publish handler */
  const handlePublish = async () => {
    setPublishing(true);
    try {
      // The backend applies the pending edits first, then publishes.
      await aiInterviewService.publishConfig(id);
      endEditSession(id);
      setShowConfirm(false);
      /* In the popup, publishing ends the flow there — as the Assessment
         Configure popup does: the record goes back to the version list. */
      if (wizardNav) {
        toast.success('AI interview published successfully.');
        wizardNav.exit();
        return;
      }
      /* Stay here and show the published screen — it is where the recruiter
         invites the first candidates from. The list page used to receive a
         `?published=1` redirect and raise a self-closing dialog, which read as
         an interruption on a page they had not chosen to go to. The record is
         marked published locally so the share form treats it as live. */
      setInterview(prev => (prev ? { ...prev, status: 'published' } : prev));
      setPublished(true);
    } catch {
      toast.error('Failed to publish');
    } finally {
      setPublishing(false);
    }
  };

  /* Navigation */
  const goBack = () => {
    router.push('/recruitment/ai-interviews/jd-selection/ai-interview-config/clusters?id=' + id + originParam);
  };

  /* Browser Back from the published screen must not step back into the
     wizard — the config is already submitted, so the Clusters/Configure
     steps a normal Back would land on are a dead end for a review that's
     over. The moment the published screen appears, push a throwaway history
     entry so Back triggers this listener instead of leaving the page, and
     send the user to the same place "Go to AI Interviews" does. */
  useEffect(() => {
    if (!published || embedded) return;
    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      router.replace(listHref);
      /* `router.replace` maps to `history.replaceState`, which only mutates
         the CURRENT entry — the throwaway one pushed above stays sitting
         ahead as a forward entry, so the browser's Forward button would
         still resurrect the finished wizard. A same-URL `pushState` right
         after truncates everything ahead of the now-replaced entry, taking
         Forward off the table too. */
      window.history.pushState(null, '', listHref);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [published, listHref, router, embedded]);

  /* Write this step's state: stamp it so a draft reopens on Preview. A
     PUBLISHED config is not stamped — it does not reopen from a step, and the
     stamp alone would leave it with "Unpublished changes" that change nothing.
     On an existing config the write is staged (aiInterviewEditSession). */
  const saveState = async (): Promise<boolean> => {
    if (!id || !interview || interview.status === 'published') return true;
    try {
      let si: Record<string, unknown> = {};
      try { si = JSON.parse(interview.special_instructions || '{}') ?? {}; } catch { /* keep {} */ }
      si.wizard_step = CURRENT_STEP;
      await aiInterviewService.update(id, {
        special_instructions: JSON.stringify(si),
        save_and_exit: true,
      });
      return true;
    } catch {
      toast.error('Failed to save draft');
      return false;
    }
  };

  const handleSaveAsDraft = async () => {
    // Save as Draft never unpublishes: a published version keeps its edits
    // pending and stays live (keepWizardChanges).
    if (!(await saveState())) return;
    let message = 'Draft saved!';
    if (id) {
      try {
        message = await keepWizardChanges(id, interview?.status);
      } catch (err) {
        toast.error(friendlyErrorMessage(err, 'Failed to save draft'));
        return;
      }
    }
    leaveGuard.isNavigatingRef.current = true;
    toast.success(message);
    router.push(exitHref ?? '/recruitment/ai-interviews');
  };

  /* Discard — the wizard's one rule (lib/utils/aiInterviewUnsavedVersion):
     an UNSAVED draft (a new interview, or the version Duplicate just minted)
     is deleted; any other version — a draft saved earlier, a published / live
     one — has this edit's pending changes dropped and stays as last saved. */
  const discardDeletesVersion = !!id && interview?.status === 'draft' && isUnsavedVersion(id);
  const handleDiscard = async () => {
    leaveGuard.isNavigatingRef.current = true;
    if (id) {
      const ok = await discardWizardChanges(id, discardDeletesVersion);
      if (ok && discardDeletesVersion) toast.success('Draft discarded');
    }
    router.push(exitHref ?? '/recruitment/ai-interviews');
  };

  /* ── Leaving with something unsaved ──
     Asks only when there is something to keep or lose: pending edits on this
     config (this visit's, or earlier ones restored on load) or a new interview
     never saved. Nothing on this step itself is editable. Not once published —
     that screen has its own Back handling (above). */
  const leaveGuard = useInterviewLeaveGuard({
    active: !loading && !!interview && !published,
    wizardNav,
    needsPrompt: () =>
      !!id && (!!interview?.has_pending_edits || hasPendingThisVisit(id) || isUnsavedVersion(id)),
  });

  /* ───────────── Loading state ───────────── */
  if (loading) {
    return (
      <AIInterviewFlowLoader message="Loading preview…" />
    );
  }

  if (!interview) {
    return (
      <div className="flex items-center justify-center min-h-[60dvh] bg-slate-50">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Interview configuration not found.</p>
          <button
            onClick={() => router.push('/recruitment/ai-interviews')}
            className="text-sm text-brand-blue underline"
          >
            Go to AI Interviews
          </button>
        </div>
      </div>
    );
  }

  /* ───────────── Published ───────────── */
  if (published) {
    const publishedRole = stripVersionFromTitle(interview.jd_title || interview.position || '');
    return (
      <>
        <main className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
          <div className="mx-auto w-full max-w-[1400px]">
            <div className="p-4 md:p-8 w-full min-h-[calc(100dvh-7rem)] bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
              <PageBreadcrumb
                barRef={breadcrumbBarRef}
                /* Inside the wizard popup the popup's header names the flow. */
                className={`mb-4 md:mb-6${embedded ? ' hidden' : ''}`}
                items={fromInviteOrigin
                  ? [
                      { label: 'Dashboard', href: '/dashboard' },
                      { label: inviteOriginLabel, href: candidateCrumb ? inviteOriginPath : inviteOriginReturn },
                      ...(candidateCrumb ? [candidateCrumb] : []),
                      { label: position },
                    ]
                  : fromJobDetails && interview?.jd_id
                  ? [
                      // Published from a flow that started on Job Details: keep
                      // that page's trail, as the unpublished state does.
                      { label: 'Dashboard', href: '/dashboard' },
                      { label: 'Job Descriptions', href: '/recruitment/job-openings' },
                      { label: interview?.jd_title || position, href: `/recruitment/job-details?id=${encodeURIComponent(interview.jd_id)}` },
                      { label: position },
                    ]
                  : [
                      { label: 'Dashboard', href: '/dashboard' },
                      { label: 'AI Interviews', href: '/recruitment/ai-interviews' },
                      { label: position },
                    ]}
              />
              <AIInterviewStepIndicator currentStep={CURRENT_STEP} topOffset={breadcrumbHeight} />

              <div className="py-4 sm:py-6 text-center">
                {/* The published tick, animated — the same Lottie every other
                    "published" screen plays (JD creation among them). It
                    replaces the tinted disc outright: it brings its own circle
                    and throws particles past its edge, and a ring behind it
                    would draw a hard line straight through the burst. */}
                <div className="flex justify-center mb-4 sm:mb-5">
                  <SuccessAnimation />
                </div>

                {/* Laid out as Assessment Published is: headline, the one-line
                    card, the compact row of ways on — with the handoff hint
                    only when there is a next step elsewhere to name. */}
                <h1 className={`text-lg sm:text-xl font-semibold text-gray-900 tracking-tight ${fromInviteOrigin ? 'mb-2 sm:mb-3' : 'mb-4 sm:mb-5'}`}>
                  AI Interview Published!
                </h1>
                {fromInviteOrigin && (
                  <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-5">
                    Next, send it to the candidates you picked in {inviteOriginLabel}.
                  </p>
                )}

                {/* What was published: "[JD-294] Java Developer [V1] [AI
                    Interview V2]", the bare V being the job version and the
                    interview's own version named as such. */}
                <PublishedSummaryCard
                  className={`mx-auto mb-5 sm:mb-6 w-fit max-w-full ${fromInviteOrigin ? 'sm:max-w-xl' : 'sm:max-w-3xl'}`}
                  icon={<Video className="w-5 h-5 text-brand-blue" />}
                  jobId={interview.jd_short_id}
                  jobName={publishedRole}
                  jobVersion={interview.jd_version}
                  ownVersion={interviewVersion != null ? `AI Interview V${interviewVersion}` : null}
                />

                <PublishedActions>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => router.push(`/recruitment/ai-interviews/${encodeURIComponent(id)}`)}
                    icon={<Eye className="w-4 h-4" />}
                  >
                    View Interview
                  </Button>
                  {!fromInviteOrigin && (
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => {
                        if (!canInviteAIInterview) return;
                        openInvite({
                          kind: 'interview',
                          job: interview.jd_id
                            ? {
                                jdId: interview.jd_id,
                                jdTitle: interview.jd_title || interview.position || '',
                                jdCode: interview.jd_short_id,
                                versionNumber: interview.jd_version,
                                status: isJdDisabled(interview.jd_status) ? 'Disabled' : interview.jd_status,
                              }
                            : undefined,
                          versionId: interview.id,
                        });
                      }}
                      aria-disabled={!canInviteAIInterview}
                      title={!canInviteAIInterview ? 'You do not have permission to invite candidates' : undefined}
                      className={!canInviteAIInterview ? 'opacity-50 cursor-not-allowed' : ''}
                      icon={<Share2 className="w-4 h-4" />}
                    >
                      Share Invite Link
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    type="button"
                    onClick={() => (fromInviteOrigin ? router.replace(listHref) : router.push(listHref))}
                    icon={<ArrowRight className="w-4 h-4" />}
                  >
                    {fromInviteOrigin ? handoffContinueLabel() : 'Go to All AI Interviews'}
                  </Button>
                </PublishedActions>
              </div>
            </div>
          </div>
        </main>

      </>
    );
  }

  /* ───────────── Preview mode ───────────── */
  return (
    <>
      {/* Page shell mirrors the Clusters step: centered max-w-[1400px] content
          card so both steps of the flow line up at the same width and gutters. */}
      <main className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full min-h-[calc(100dvh-7rem)] bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
            <PageBreadcrumb
              barRef={breadcrumbBarRef}
              /* Inside the wizard popup the popup's header names the flow. */
              className={`mb-4 md:mb-6${embedded ? ' hidden' : ''}`}
              items={
                fromInviteOrigin
                  ? [
                      { label: 'Dashboard', href: '/dashboard' },
                      { label: inviteOriginLabel, href: candidateCrumb ? inviteOriginPath : inviteOriginReturn },
                      ...(candidateCrumb ? [candidateCrumb] : []),
                      { label: 'Create AI Interview' },
                      { label: 'Preview & Publish' },
                    ]
                  : fromJobDetails && interview?.jd_id
                  ? [
                      // Entered from Job Details — repeat that page's trail and link
                      // the JD crumb back to it so the user returns where they started.
                      { label: 'Dashboard', href: '/dashboard' },
                      { label: 'Job Descriptions', href: '/recruitment/job-openings' },
                      { label: interview?.jd_title || position, href: `/recruitment/job-details?id=${encodeURIComponent(interview.jd_id)}` },
                      { label: 'Create AI Interview' },
                      { label: 'Preview & Publish' },
                    ]
                  : [
                      { label: 'Dashboard', href: '/dashboard' },
                      { label: 'AI Interviews', href: '/recruitment/ai-interviews' },
                      // Name the JD being previewed so the trail identifies the record.
                      { label: interview?.jd_title || position || 'Preview & Publish' },
                    ]
              }
            />
            {/* Step indicator — a direct child of the card, so it can stick. */}
            <AIInterviewStepIndicator currentStep={CURRENT_STEP} topOffset={breadcrumbHeight} />

            {/* Header */}
            <div className="mb-6">
              {/* Header row */}
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-5 h-5 text-brand-blue" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h1 className="tf-page-title">Review &amp; Publish</h1>
                    {/* The same stealth dot the Clusters step carries after its
                        heading: the per-question skill plan, one click away on
                        the last screen before publishing. Reads the SAVED plan
                        through the shared popover, so this page, the invite
                        details page and the results page cannot drift. */}
                    {(mthClusters.length > 0 || nthClusters.length > 0) && (
                      <QuestionDistributionPopover
                        specialInstructions={interview.special_instructions}
                        clusters={[...mthClusters, ...nthClusters]}
                        hrQuestions={hrRound?.enabled ? ((hrRound.hr_questions as AIInterviewHRQuestion[] | undefined) ?? []) : []}
                        /* Without this the dot vanishes on any draft whose
                           distribution was never saved — the Clusters step only
                           persists one on finalize, and its backend call is
                           allowed to fail silently. The thunk runs only when
                           nothing is saved. */
                        fallback={() => ({
                          mth: distributeSkillsLocally(mthClusters, timedAllocation.mthQuestions ?? 0),
                          nth: nthRound?.enabled
                            ? distributeSkillsLocally(nthClusters, timedAllocation.nthQuestions ?? 0)
                            : [],
                        })}
                      />
                    )}
                  </div>
                  <p className="tf-body-muted mt-0.5">
                    Review your interview configuration before publishing. You can go back and make changes if needed.
                  </p>
                </div>
              </div>
            </div>

      {/* Two columns, as on Configure and Clusters: the configuration on the
          left, the same Configuration Summary on the right, so the last step
          of the flow reads like the two before it. */}
      {/* No `items-start`: the sidebar column has to stretch to the row's
          full height, or its sticky card has nothing to travel inside and
          scrolls off after one screen, leaving the right half blank. */}
      <div className="flex flex-col lg:flex-row gap-6 lg:items-stretch">
      <div className="flex-1 min-w-0 space-y-5">
        {/* ── JD card ──────────────────────────────────────────────────────
            The same row the JD picker and Configure draw, so the record reads
            the same on every step: id, title, status, version, then the
            role facts on one line. Built from the JD fields the interview
            record carries; what it does not carry (employment type, posted
            date, author) the summary simply leaves out. */}
        <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 px-4 py-3.5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="min-w-0 flex-1">
              <JobOpeningSummary job={jdAsJob} mergeInfoRows />
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-shrink-0">
              {interview.jd_id && (
                <button
                  type="button"
                  onClick={() => setJdViewOpen(true)}
                  className="inline-flex items-center justify-center gap-1.5 text-sm text-brand-blue border border-brand-blue/40 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg hover:bg-brand-blue/10 hover:border-brand-blue transition-colors whitespace-nowrap"
                  title="Read this job description"
                >
                  <Eye className="w-4 h-4" />
                  View JD
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Interview Overview ── */}
        <SectionCard title="Interview Overview" icon={Brain}>
          <div className="flex flex-col lg:flex-row gap-4 items-start">
            {/* The three facts that decide what the candidate meets: how long and
                under what pacing, what transcribes them, and which rounds run. */}
            <div className="flex flex-col gap-3 lg:w-72 lg:flex-shrink-0">
              <div className="rounded-xl border border-gray-100 ring-1 ring-black/[0.02] p-3 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand-cyan/10 ring-1 ring-brand-cyan/20 flex items-center justify-center flex-shrink-0">
                  <Timer className="w-4 h-4 text-brand-cyan" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xs text-gray-500">Interview Mode</p>
                  <p className="tf-cell-name">
                    {mode === 'fixed' ? 'Timed Interview' : 'Conversational'}
                  </p>
                  <p className="text-2xs text-gray-500">
                    {mode === 'fixed'
                      ? `${duration} minutes`
                      : `${bufferEnabled ? 35 : 30} minutes${bufferEnabled ? ' · +5 min buffer' : ''}`}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 ring-1 ring-black/[0.02] p-3 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                  <Mic className="w-4 h-4 text-brand-blue" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xs text-gray-500">AI Model</p>
                  <p className="tf-cell-name truncate">{sttOption.label}</p>
                  {sttOption.recommended && (
                    <span className="inline-flex items-center mt-0.5 px-1.5 py-0.5 text-2xs font-medium rounded-full bg-advice-positive-bg text-advice-positive ring-1 ring-advice-positive/25">
                      Recommended
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 ring-1 ring-black/[0.02] p-3 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand-orange/10 ring-1 ring-brand-orange/15 flex items-center justify-center flex-shrink-0">
                  <Layers className="w-4 h-4 text-brand-orange-deep" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xs text-gray-500">Interview Type</p>
                  <p className="tf-cell-name">{interviewTypeLabel}</p>
                  <p className="text-2xs text-gray-500">
                    {enabledRounds.length} round{enabledRounds.length === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
            </div>

            {/* Time Allocation table (fixed mode only), to the right of the overview cards */}
            {mode === 'fixed' && enabledRounds.length > 0 && (
              <div className="flex-1 min-w-0 w-full">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-brand-blue" />
                  <h4 className="text-sm font-semibold text-gray-800 tracking-tight">Time Allocation</h4>
                </div>
                {/* Below sm: no 360px floor, tighter cells, no wrapping — the
                    round names no longer break mid-word ("Must-To-/Have") and
                    Time stays in view or a short scroll away. */}
                <div className="overflow-x-auto rounded-lg border border-gray-100 ring-1 ring-black/[0.02]">
                  <table className="w-full sm:min-w-[360px] text-sm whitespace-nowrap">
                    <thead>
                      <tr className="bg-white text-left">
                        <th className="px-2 sm:px-4 py-2.5 tf-th">Round</th>
                        <th className="px-2 sm:px-4 py-2.5 tf-th text-right">Questions</th>
                        <th className="px-2 sm:px-4 py-2.5 tf-th text-right">Clusters</th>
                        <th className="px-2 sm:px-4 py-2.5 tf-th text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {enabledRounds.map(r => {
                        const isMth = r.type === 'must_have_skills' || r.type === 'must_to_have' || r.type === 'technical';
                        const isNth = r.type === 'nice_to_have_skills' || r.type === 'nice_to_have';
                        const roundLabel = isMth ? 'Must-To-Have' : isNth ? 'Nice-To-Have' : r.type === 'hr' ? 'HR Round' : r.type;
                        const previewMin = timedPreviewDurations[r.type] ?? r.duration_minutes;
                        const previewQuestions = timedPreviewQuestions[r.type] ?? r.planned_questions ?? 0;
                        const clusterCount = isMth ? mthClusters.length : isNth ? nthClusters.length : null;
                        return (
                          <tr key={r.type}>
                            <td className="px-2 sm:px-4 py-2.5 text-gray-900">{roundLabel}</td>
                            <td className="px-2 sm:px-4 py-2.5 text-gray-700 text-right">
                              <span className="inline-flex items-center justify-center min-w-[24px] px-2 py-0.5 rounded-md text-xs font-semibold bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">{previewQuestions}</span>
                            </td>
                            <td className="px-2 sm:px-4 py-2.5 text-gray-700 text-right">{clusterCount !== null ? clusterCount : '—'}</td>
                            <td className="px-2 sm:px-4 py-2.5 text-gray-700 text-right">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20">{previewMin} min</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 font-semibold">
                        <td className="px-2 sm:px-4 py-2.5 text-gray-900">Total</td>
                        <td className="px-2 sm:px-4 py-2.5 text-gray-900 text-right">
                          {enabledRounds.reduce((s, r) => s + (timedPreviewQuestions[r.type] ?? r.planned_questions ?? 0), 0)}
                        </td>
                        <td className="px-2 sm:px-4 py-2.5 text-gray-900 text-right">
                          {mthClusters.length + nthClusters.length}
                        </td>
                        <td className="px-2 sm:px-4 py-2.5 text-gray-900 text-right">
                          {enabledRounds.reduce((s, r) => s + (timedPreviewDurations[r.type] ?? r.duration_minutes), 0)} min
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        </SectionCard>

        {/* ── Skill Clusters Card ── */}
        {(mthClusters.length > 0 || nthClusters.length > 0) && (
          <SectionCard
            title="Skill Clusters"
            icon={Layers}
            badge={
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium bg-slate-100 text-gray-600 ring-1 ring-gray-200/70">
                {mthClusters.length + nthClusters.length} cluster{mthClusters.length + nthClusters.length === 1 ? '' : 's'}
              </span>
            }
            action={
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-brand-blue border border-brand-blue/30 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue transition-colors"
              >
                <Layers className="w-3.5 h-3.5" />
                View / Edit Clusters
              </button>
            }
          >
            <div className="space-y-6">
              {/* Must-To-Have Clusters */}
              {mthClusters.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Must-To-Have Clusters</h4>
                  <div className="space-y-3">
                    {mthClusters.map(cluster => (
                      <div key={cluster.id} className="border border-gray-100 ring-1 ring-black/[0.02] rounded-lg p-4 bg-white hover:border-brand-blue/30 hover:shadow-sm hover:shadow-brand-blue/10 transition-all">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <PriorityBadge p={cluster.priority} />
                          <span className="min-w-0 break-words tf-cell-name">{cluster.name}</span>
                          <span className="text-xs text-gray-400 ml-auto">
                            {cluster.skills.length} skill{cluster.skills.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {cluster.skills.map(skill => (
                            <span
                              key={skill}
                              className="inline-flex items-center px-2 py-0.5 rounded-md bg-brand-blue/5 text-xs text-brand-blue ring-1 ring-brand-blue/20"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Nice-To-Have Clusters */}
              {nthClusters.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Nice-To-Have Clusters</h4>
                  <div className="space-y-3">
                    {nthClusters.map(cluster => (
                      <div key={cluster.id} className="border border-gray-100 ring-1 ring-black/[0.02] rounded-lg p-4 bg-white hover:border-brand-cyan/30 hover:shadow-sm hover:shadow-brand-cyan/10 transition-all">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <PriorityBadge p={cluster.priority} />
                          <span className="min-w-0 break-words tf-cell-name">{cluster.name}</span>
                          <span className="text-xs text-gray-400 ml-auto">
                            {cluster.skills.length} skill{cluster.skills.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {cluster.skills.map(skill => (
                            <span
                              key={skill}
                              className="inline-flex items-center px-2 py-0.5 rounded-md bg-brand-cyan/10 text-xs text-brand-cyan ring-1 ring-brand-cyan/20"
                            >
                              {skill}
                            </span>
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

        {/* ── HR Round Card ── */}
        {hrRound?.enabled && (
          <SectionCard
            title="HR Round"
            icon={Users}
            badge={
              hrRound.hr_questions?.length ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
                  {hrRound.hr_questions.length} question{hrRound.hr_questions.length === 1 ? '' : 's'}
                </span>
              ) : undefined
            }
            action={<EditInConfigureButton onClick={editInConfigure} />}
          >
            {mode === 'fixed' && (
              <div className="mt-4 space-y-0 divide-y divide-gray-100">
                <InfoRow label="Questions" value={`${timedAllocation.hrQuestions}`} />
                <InfoRow label="Time" value={`${timedAllocation.hrMinutes} min`} />
              </div>
            )}
            {hrRound.hr_questions?.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Selected HR Questions</p>
                <ol className="space-y-2">
                  {(hrRound.hr_questions as AIInterviewHRQuestion[]).map((q, idx) => (
                    <li key={q.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50 border border-gray-100">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 text-2xs font-bold flex items-center justify-center mt-0.5">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800">{q.question_text}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-2xs text-gray-400">{q.answer_type === 'yes_no' ? 'Yes / No' : 'Text answer'}</span>
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

        {/* ── Settings Card ──────────────────────────────────────────────
            Three settings, one compact row each: name on the left, its value
            on the right, and — where there is something to do with it — the
            control beside the value. They were `InfoRow`s stacked with an
            inline <video> player wedged between two of them, which made the
            card's rows different heights and its dividers land at random. */}
        <SectionCard title="Settings" icon={Settings} action={<EditInConfigureButton onClick={editInConfigure} />}>
          <div className="rounded-lg border border-gray-100 ring-1 ring-black/[0.02] divide-y divide-gray-100 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
              <span className="tf-card-desc">Recording</span>
              {interview.recording_enabled ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-advice-positive-bg text-advice-positive ring-1 ring-advice-positive/25">
                  <Video className="w-3 h-3" /> Enabled
                </span>
              ) : (
                <span className="text-sm text-gray-400">Disabled</span>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5">
              <span className="tf-card-desc">Introduction Video</span>
              {interview.introduction_video_url ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
                    <Video className="w-3 h-3" /> Uploaded
                  </span>
                  {/* The player opens on demand rather than sitting in the row:
                      a 240px video between two 40px rows was the single thing
                      breaking this card's rhythm. */}
                  <button
                    type="button"
                    onClick={() => setShowVideoPreview(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-brand-blue border border-brand-blue/30 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue transition-colors"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Preview
                  </button>
                </div>
              ) : (
                <span className="text-sm text-gray-400">None</span>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
              <span className="tf-card-desc flex-shrink-0">Languages</span>
              <div className="flex flex-wrap items-center gap-1.5 justify-end">
                {languages.map(lang => (
                  <span
                    key={lang}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-blue/5 text-xs text-brand-blue ring-1 ring-brand-blue/20"
                  >
                    <Globe className="w-3 h-3 text-brand-blue" />
                    {lang}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ── Configuration Summary sidebar ── */}
      <div className="w-full lg:w-72 xl:w-80 flex-shrink-0">
        <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto scrollbar-auto-hide">
          <div className="mb-4">
            <SectionHeader
              icon={ClipboardList}
              title="Configuration Summary"
              subtitle="What this interview will look like once published."
            />
          </div>

          <div className="border border-gray-100 rounded-lg overflow-hidden mb-4 ring-1 ring-black/[0.02]">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
              <span className="text-xs font-medium text-brand-blue">Job Details</span>
            </div>
            <div className="divide-y divide-gray-50">
              <div className="px-3 py-2 flex items-start justify-between gap-2">
                <span className="tf-meta flex-shrink-0">Role Title</span>
                <span className="min-w-0 break-words text-xs font-semibold text-gray-900 text-right">{position}</span>
              </div>
              {interview.jd_short_id && (
                <div className="px-3 py-2 flex items-start justify-between gap-2">
                  <span className="tf-meta flex-shrink-0">JD ID</span>
                  <span className="text-xs font-semibold text-gray-900 text-right">{interview.jd_short_id}</span>
                </div>
              )}
              {interview.jd_experience_level && (
                <div className="px-3 py-2 flex items-start justify-between gap-2">
                  <span className="tf-meta flex-shrink-0">Level</span>
                  <span className="text-xs font-semibold text-gray-900 text-right">{interview.jd_experience_level}</span>
                </div>
              )}
              {interview.jd_industry_type && (
                <div className="px-3 py-2 flex items-start justify-between gap-2">
                  <span className="tf-meta flex-shrink-0">Industry</span>
                  <span className="text-xs font-semibold text-gray-900 text-right">{formatIndustryType(interview.jd_industry_type)}</span>
                </div>
              )}
              {interview.jd_location && (
                <div className="px-3 py-2 flex items-center justify-between gap-2">
                  <span className="tf-meta flex-shrink-0">Location</span>
                  <SummaryLocation value={interview.jd_location} locations={jdLocations} />
                </div>
              )}
              {interview.jd_version != null && (
                <div className="px-3 py-2 flex items-start justify-between gap-2">
                  <span className="tf-meta flex-shrink-0">JD Version</span>
                  <span className="text-xs font-semibold text-gray-900 text-right">v{interview.jd_version}</span>
                </div>
              )}
              <div className="px-3 py-2 flex items-center justify-between gap-2">
                <span className="tf-meta flex-shrink-0">Interview Mode</span>
                <span className="text-xs font-semibold text-gray-900 text-right">
                  {mode === 'fixed' ? 'Timed' : 'Conversational'}
                </span>
              </div>
              <div className="px-3 py-2 flex items-center justify-between gap-2">
                <span className="tf-meta flex-shrink-0">Total Duration</span>
                <span className="text-xs font-semibold text-gray-900 text-right">
                  {mode === 'fixed' ? duration : bufferEnabled ? 35 : 30} min
                </span>
              </div>
              {interview.created_by_name && (
                <div className="px-3 py-2 flex items-start justify-between gap-2">
                  <span className="tf-meta flex-shrink-0">Created By</span>
                  <span className="text-xs font-semibold text-gray-900 text-right">{interview.created_by_name}</span>
                </div>
              )}
            </div>
          </div>

          {mode === 'fixed' && enabledRounds.length > 0 && (
            <div className="border border-gray-100 rounded-lg overflow-hidden mb-4 ring-1 ring-black/[0.02]">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-medium text-brand-blue">
                  Question Budget (Total: {totalPreviewQuestions})
                </span>
                <span className="text-xs text-gray-400">{totalPreviewMinutes} min</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-3 py-1.5 text-left tf-th">Round</th>
                      <th className="px-3 py-1.5 text-right tf-th">Q</th>
                      <th className="px-3 py-1.5 text-right tf-th">Clusters</th>
                      <th className="px-3 py-1.5 text-right tf-th">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enabledRounds.map(r => {
                      const isMth = r.type === 'must_have_skills' || r.type === 'must_to_have' || r.type === 'technical';
                      const isNth = r.type === 'nice_to_have_skills' || r.type === 'nice_to_have';
                      const label = isMth ? 'Must-to-Have' : isNth ? 'Nice-to-Have' : r.type === 'hr' ? 'HR Round' : r.type;
                      const clusterCount = isMth ? mthClusters.length : isNth ? nthClusters.length : null;
                      return (
                        <tr key={r.type} className="border-b border-gray-50 last:border-0">
                          <td className="px-3 py-2 text-gray-600">{label}</td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900">
                            {timedPreviewQuestions[r.type] ?? r.planned_questions ?? 0}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900">
                            {clusterCount !== null ? clusterCount : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900">
                            {timedPreviewDurations[r.type] ?? r.duration_minutes}m
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(mthClusters.length > 0 || nthClusters.length > 0) && (
            <div className="border border-gray-100 rounded-lg overflow-hidden ring-1 ring-black/[0.02]">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                <span className="text-xs font-medium text-brand-blue">Clusters</span>
              </div>
              <div className="p-3 space-y-3">
                {[
                  { label: 'Must-to-Have', count: mthClusters.length, show: mthClusters.length > 0 },
                  { label: 'Nice-to-Have', count: nthClusters.length, show: nthClusters.length > 0 },
                ]
                  .filter(row => row.show)
                  .map(row => (
                    <div key={row.label} className="flex items-center justify-between">
                      <span className="tf-meta-strong">{row.label}</span>
                      <span className="text-xs font-semibold text-advice-positive">
                        {row.count} cluster{row.count === 1 ? '' : 's'}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
      </div>


            {/* ── Wizard actions ── */}
            {/* In normal flow at the end of the page (not sticky), matching
                the Configure step. */}
            <div className="mt-6 pt-4 border-t border-gray-100 dark:border-slate-700/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
              <div className="flex items-center justify-between sm:justify-start gap-2">
                <Button variant="secondary" size="md" onClick={goBack} icon={<ArrowLeft className="w-4 h-4" />}>
                  Back to Clusters
                </Button>
                <WizardDiscardButton onClick={handleDiscard} label={discardDeletesVersion ? 'Discard' : 'Discard changes'} />
              </div>
              {/* Phones stack the two actions full-width, Publish on top. */}
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2">
                <Button variant="secondary" size="md" onClick={handleSaveAsDraft} className="w-full sm:w-auto justify-center">
                  Save as Draft
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => {
                    if (!canPublishAIInterview) return;
                    setShowConfirm(true);
                  }}
                  disabled={publishing}
                  aria-disabled={!canPublishAIInterview}
                  title={!canPublishAIInterview ? 'You do not have permission to publish AI interviews' : undefined}
                  className={`w-full sm:w-auto justify-center ${!canPublishAIInterview ? 'opacity-50 cursor-not-allowed' : ''}`}
                  icon={publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
                >
                  {publishing ? 'Publishing...' : (
                    <>
                      Publish Interview
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>{/* closes content card */}
        </div>{/* closes mx-auto max-w wrapper */}
      </main>{/* closes flex-1 main */}


      {/* ── Job description, in place ── */}
      {jdViewOpen && interview.jd_id && (
        <WizardLayer>
          <JDFullViewModal
            jdId={interview.jd_id}
            jdTitle={interview.jd_title ?? position}
            onClose={() => setJdViewOpen(false)}
            /* In the popup, the job's card opens the JD, as on Job Details. */
            showJobCard={embedded}
            cancelInFooter={embedded}
          />
        </WizardLayer>
      )}

      {/* ── Introduction video ── */}
      <Dialog open={showVideoPreview} onOpenChange={setShowVideoPreview}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2 bg-gray-50 border-b border-gray-100">
            <DialogTitle className="text-sm font-semibold tracking-tight">Introduction Video</DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              What the candidate sees before the interview starts.
            </DialogDescription>
          </DialogHeader>
          <div className="px-4 pb-4 pt-3">
            <div className="rounded-lg overflow-hidden bg-black aspect-video">
              {showVideoPreview && interview.introduction_video_url && (
                <video src={interview.introduction_video_url} controls autoPlay className="w-full h-full object-contain">
                  Your browser does not support the video tag.
                </video>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* "Being edited by X" - View only / Take over (see InterviewEditLockGate). */}
      <InterviewEditLockGate configId={id} />

      {/* ── Leave prompt ── */}
      <WizardLeavePrompt
        target={leaveGuard.leaveTarget}
        onStay={leaveGuard.cancelLeave}
        onLeave={leaveGuard.leaveTo}
        configId={id}
        status={interview.status}
        createdThisVisit={discardDeletesVersion}
        canDelete={!(interview.invitations_count ?? 0)}
        versionNumber={interview.interview_version ?? undefined}
        jdCode={interview.jd_short_id}
        title={interview.jd_title ?? position}
        currentStepLabel="Preview & Publish"
        saveState={saveState}
        afterDeleteHref={exitHref ?? '/recruitment/ai-interviews'}
      />

      {/* ── Confirmation Dialog ── */}
      <ConfirmationDialog
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handlePublish}
        title="Publish Interview?"
        description="Once published, the interview will be live and available for candidate invitations. You can still make changes later."
        confirmText="Yes, Publish"
        cancelText="Cancel"
        variant="info"
      />
    </>
  );
}
