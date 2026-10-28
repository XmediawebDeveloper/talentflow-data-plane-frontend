'use client';

import { useEffect, useEffectEvent, useRef, useState, type ComponentProps } from 'react';
import { ArrowLeft, CheckCircle, ClipboardList, Loader2, Mail, Video } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import { Button } from '@/components/ui/button';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { useAuth } from '@/lib/hooks/useAuth';
import api from '@/lib/services/api';
import VersionList, { VersionUsage } from './VersionList';
import SendToPanel from './SendToPanel';
import ServerCandidatePicker, { EMPTY_SELECTION, describeFilters, selectionCount, toRequestSelection, type PickerSelection } from './ServerCandidatePicker';
import ExtraCandidatesInput from './ExtraCandidatesInput';
import InviteQuotaBar from './InviteQuotaBar';
import { DEFAULT_EXPIRY_DAYS, defaultInviteMessage } from './inviteDefaults';
import BulkInviteProgressPanel from '@/components/bulk-invite/BulkInviteProgressPanel';
import { bulkInviteService, type BulkInviteJob, type BulkExtraCandidate } from '@/lib/services/bulkInviteService';
import { useOptionalBulkInviteProgress } from '@/contexts/BulkInviteProgressContext';
import { assessmentService } from '@/lib/services/assessmentService';
import { aiInterviewService, type AIInterviewResponse } from '@/lib/services/aiInterviewService';
import type { AssessmentResponse } from '@/lib/services/assessmentService';
import AssessmentPicker from '@/components/assessments/AssessmentPicker';
import AssessmentPreviewModal from '@/components/AssessmentPreviewModal';
import AssessmentConfigureModal from '@/components/AssessmentConfigureModal';
import AIInterviewPicker, { type AIInterviewPickerSelection } from '@/components/ai-interview/AIInterviewPicker';
import ConfigurePreviewDialog from '@/components/ai-interview/ConfigurePreviewDialog';
import AIInterviewWizardDialog from '@/components/ai-interview/AIInterviewWizardDialog';
import { VersionChip } from '@/components/assessments/AssessmentVersionHistoryPanel';
import {
  KIND_LABEL,
  createBlockedReason,
  createPageHref,
  deleteVersion,
  duplicateVersion,
  loadAllInterviewConfigs,
  loadAssessmentForPopup,
  loadBrowseAssessments,
  listedVersions,
  loadVersions,
  nextVersionNumber,
  runVersionAction,
  versionHref,
  INVITE_SOURCE_BY_TAB,
  type InviteCandidate,
  type InviteKind,
  type InviteVersion,
  type VersionActionItem,
  type VersionPermissions,
} from './inviteVersions';

interface PendingConfirm {
  title: string;
  message: string;
  confirmText: string;
  destructive?: boolean;
  run: () => Promise<void>;
}

/** The job an invite is for. */
interface InviteJob {
  jdId: string;
  jdCode?: string;
  jdTitle: string;
  jobVersionNumber?: number;
}

/**
 * THE invite popup — every Invite / Send / Invite More / Share / Create /
 * Send button for an Assessment or an AI Interview opens this one component
 * (through `InviteDialogProvider`'s `useInviteDialog().open(...)`, or the
 * hosts that mount it). Change it here and every place follows.
 *
 * One popup, top to bottom:
 *  - the job (picked first when the button has none: every published
 *    assessment / AI interview, any job);
 *  - the version cards — only when the button did not fix the version — with
 *    create, view, edit and the rest of the version actions;
 *  - the unit quota;
 *  - the candidates the page ticked (untick to leave out), Select From (the
 *    job's AI Talent Match / Scored Resumes lists and the resume database,
 *    server-paged) and Manual / Upload Excel with a per-row Copy Link;
 *  - the email message (a template) and the link expiry.
 * Send starts one background job (POST /jd/{id}/bulk-invites) for every
 * candidate, whose progress replaces the body and survives closing the popup.
 * Mounted only while open, so every opening starts fresh.
 */
export default function VersionInviteDialog({
  kind,
  onClose,
  jdId,
  jdCode,
  jdTitle,
  jobVersionNumber,
  candidates = [],
  versionId: fixedVersionId,
  disabledReason,
  onSent,
  onAssessmentsSent,
  onInterviewsSent,
  hideDuplicate = false,
  inviteAllowed = true,
  inviteDeniedReason,
  preselect = true,
}: {
  kind: InviteKind;
  onClose: () => void;
  /** The job. Omitted: the popup opens on the list of every published
   *  assessment / AI interview, and the pick names the job and version. */
  jdId?: string;
  jdCode?: string;
  jdTitle?: string;
  jobVersionNumber?: number;
  /** The candidates ticked on the page ([] / omitted = none). */
  candidates?: InviteCandidate[];
  /** The version the button is for (a version row's Invite, Invite More):
   *  its card list is left out. Omitted: the cards, newest sendable ticked. */
  versionId?: string;
  /** Why this type is off for the job (feature disabled, JD disabled), or null. */
  disabledReason?: string | null;
  /** Invitations went out — the host refreshes its counts. */
  onSent?: (kind: InviteKind, sentCount: number) => void;
  /** Older hosts' per-kind callbacks; called with onSent. */
  onAssessmentsSent?: (sentCount: number) => void;
  onInterviewsSent?: (sentCount: number) => void;
  /** Leave Duplicate out of the version cards' ⋯ menu. */
  hideDuplicate?: boolean;
  /** Host-specific invite gate (e.g. AI Talent Match's own entry-point
   *  permission). Omitted = no extra gate. */
  inviteAllowed?: boolean;
  /** Shown when `inviteAllowed` is false. */
  inviteDeniedReason?: string;
  /** Tick every page candidate on open. False = listed unticked. */
  preselect?: boolean;
  /** Accepted for older hosts; every send is the background job now. */
  bulk?: boolean;
}) {
  const { user, isTenantAdmin, hasPermissionCode } = useAuth();
  const p = (user?.permissions || {}) as Record<string, boolean | undefined>;
  const can = (key: string) => isTenantAdmin || !!p[key];
  const perms: VersionPermissions = kind === 'assessment'
    ? {
        canCreate: can('canCreateAssessments'),
        canUpdate: can('canUpdateAssessments'),
        canPublish: can('canUpdateAssessments') || can('canCreateAssessments'),
        // The Assessments page gates Archive / Unarchive on the delete permission.
        canArchive: can('canDeleteAssessments'),
        // What the server checks on send: Assessment → Invite Candidates.
        canInvite: isTenantAdmin || hasPermissionCode('assessments:invite'),
      }
    : {
        canCreate: can('canCreateAIInterviews'),
        canUpdate: can('canUpdateAIInterviews'),
        canPublish: can('canPublishAIInterviews'),
        canArchive: can('canArchiveAIInterviews'),
        canInvite: can('canInviteAIInterviews'),
        canDelete: can('canDeleteAIInterviews'),
      };
  if (!inviteAllowed) perms.canInvite = false;
  const label = KIND_LABEL[kind];
  const off = disabledReason || null;
  const deniedTitle = !perms.canInvite
    ? (!inviteAllowed && inviteDeniedReason ? inviteDeniedReason : `You do not have permission to invite to ${label.plural.toLowerCase()}`)
    : undefined;

  /* The job: given, or picked from the full list first. */
  const [job, setJob] = useState<InviteJob | null>(jdId ? { jdId, jdCode, jdTitle: jdTitle || '', jobVersionNumber } : null);
  const [pickedVersionId, setPickedVersionId] = useState<string | undefined>(fixedVersionId);
  const [jobPickList, setJobPickList] = useState<AssessmentResponse[] | AIInterviewResponse[] | null>(null);
  const [aiPick, setAiPick] = useState<AIInterviewPickerSelection | null>(null);
  const [asPick, setAsPick] = useState<AssessmentResponse | null>(null);

  const [versions, setVersions] = useState<InviteVersion[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(!off && !!job);
  const [error, setError] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [candidateIds, setCandidateIds] = useState<string[]>(() => (preselect ? candidates.filter((c) => c.email).map((c) => c.id) : []));
  const [message, setMessage] = useState('');
  const messageTouched = useRef(false);
  const [expiryDays, setExpiryDays] = useState(DEFAULT_EXPIRY_DAYS);
  const [quotaAvailable, setQuotaAvailable] = useState<number | null>(null);
  /* Select From: the picked rows or the filter — never the rows themselves. */
  const [serverSelection, setServerSelection] = useState<PickerSelection>(EMPTY_SELECTION);
  /* Manual / Upload Excel rows. */
  const [extras, setExtras] = useState<BulkExtraCandidate[]>([]);
  const [bulkJob, setBulkJob] = useState<BulkInviteJob | null>(null);
  const bulkTracker = useOptionalBulkInviteProgress();
  const bulkReported = useRef(false);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  /* The job's first assessment, being configured in the Configure popup. */
  const [creatingFirst, setCreatingFirst] = useState<{ topics: ComponentProps<typeof AssessmentConfigureModal>['topicSettings'] | null } | null>(null);
  /* AI interview create / edit: the wizard, in its popup, from this address. */
  const [wizardHref, setWizardHref] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const reloadOnFocus = useRef(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  /* Assessment View / Edit and the AI interview preview, over this popup. */
  const [viewing, setViewing] = useState<AssessmentResponse | null>(null);
  const [editing, setEditing] = useState<AssessmentResponse | null>(null);
  const [viewingInterviewId, setViewingInterviewId] = useState<string | null>(null);
  const preselected = useRef(false);
  const lastLoadedAt = useRef(0);

  const applyVersions = (next: InviteVersion[]) => {
    lastLoadedAt.current = Date.now();
    setVersions(next);
    setLoaded(true);
    setLoading(false);
    setError(null);
    const firstLoad = !preselected.current;
    preselected.current = true;
    const listed = listedVersions(kind, next);
    setVersionId((cur) => {
      if (cur && next.some((v) => v.id === cur && v.sendable)) return cur;
      if (firstLoad) {
        // The button's own version first; else the newest sendable one.
        if (pickedVersionId && next.some((v) => v.id === pickedVersionId)) return pickedVersionId;
        return listed.find((v) => v.sendable)?.id ?? null;
      }
      return null; // the picked version can no longer take an invite
    });
    return next;
  };
  const applyLoadError = (err: unknown) => {
    setLoaded(true);
    setLoading(false);
    setError((err as Error)?.message || `Could not load ${label.singular.toLowerCase()} versions.`);
    return null;
  };
  const fetchVersions = (): Promise<InviteVersion[] | null> =>
    job ? loadVersions(kind, job.jdId).then(applyVersions, applyLoadError) : Promise.resolve(null);
  const reload = () => {
    setLoading(true);
    setError(null);
    return fetchVersions();
  };

  // State is written in the reply's callbacks; `loading` is set where the job is set.
  const loadOnJob = useEffectEvent(() => { if (!off && job) void fetchVersions(); });
  useEffect(() => { loadOnJob(); }, [job?.jdId]);

  /* No job given: the list of every published assessment / AI interview. */
  useEffect(() => {
    if (job || off || jobPickList) return;
    const load = kind === 'assessment' ? loadBrowseAssessments() : loadAllInterviewConfigs();
    void (load as Promise<AssessmentResponse[] | AIInterviewResponse[]>).then(setJobPickList, () => setJobPickList([]));
  }, [job, off, kind, jobPickList]);

  /* The template message, filled once the job is known (and again when it
     changes) unless the recruiter has typed in it. */
  const selected = versions.find((v) => v.id === versionId) ?? null;
  useEffect(() => {
    if (!job || messageTouched.current) return;
    setMessage(defaultInviteMessage(kind, {
      jobTitle: job.jdTitle || selected?.config?.jd_title || selected?.raw?.jd_title,
      companyName: (user as { tenantName?: string } | null)?.tenantName,
      location: selected?.config?.jd_location,
    }));
  }, [job, kind, selected?.id, user]);

  const reloadAfterReturn = useEffectEvent(() => {
    if (off || !job || confirmBusy || creating || !loaded) return;
    if (document.visibilityState === 'hidden') return;
    const forced = reloadOnFocus.current;
    if (!forced && Date.now() - lastLoadedAt.current < 10_000) return;
    reloadOnFocus.current = false;
    void fetchVersions();
  });
  const closeOnEscape = useEffectEvent((e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (document.querySelector('[role="menu"]')) return;
    if (viewing) { setViewing(null); return; }
    if (viewingInterviewId) return;
    if (editing || creatingFirst || wizardHref) return;
    if (confirm && !confirmBusy) setConfirm(null);
    else if (!confirmBusy) onClose();
  });
  useEffect(() => {
    const onFocus = () => reloadAfterReturn();
    const onKey = (e: KeyboardEvent) => closeOnEscape(e);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);

  /* The version is fixed when the button named it and it can still be sent. */
  const versionFixed = !!pickedVersionId && !!selected && selected.id === pickedVersionId && selected.sendable;
  const recipients = candidates.filter((c) => c.email && candidateIds.includes(c.id));
  const recipientCount = recipients.length + selectionCount(serverSelection) + extras.length;
  const blocked = createBlockedReason(versions, perms, kind);
  const returnUrl = job ? `/recruitment/job-details?id=${encodeURIComponent(job.jdId)}` : '/recruitment/job-openings';
  const close = () => { if (!confirmBusy) onClose(); };
  const quotaShort = quotaAvailable !== null && recipientCount > quotaAvailable;

  /* Picking from the full list (no job given): the job and the version. */
  const chooseFromList = () => {
    if (kind === 'assessment' && asPick) {
      setJob({ jdId: asPick.jd_id, jdCode: asPick.jd_short_id, jdTitle: asPick.jd_title || '', jobVersionNumber: asPick.jd_version });
      setPickedVersionId(asPick.id);
    } else if (kind === 'interview' && aiPick) {
      const cfg = (jobPickList as AIInterviewResponse[] | null)?.find((c) => c.id === aiPick.interviewId);
      if (!cfg?.jd_id) return;
      setJob({ jdId: cfg.jd_id, jdCode: (cfg as { jd_short_id?: string }).jd_short_id, jdTitle: cfg.jd_title || cfg.position || '', jobVersionNumber: cfg.jd_version });
      setPickedVersionId(cfg.id);
    }
    preselected.current = false;
    setLoading(true);
    bodyRef.current?.scrollTo({ top: 0 });
  };
  const backToList = () => {
    setJob(null);
    setPickedVersionId(undefined);
    setVersions([]);
    setVersionId(null);
    setLoaded(false);
    setServerSelection(EMPTY_SELECTION);
    messageTouched.current = false;
  };
  /* "Change version" on a fixed version: the cards come back. */
  const showAllVersions = () => setPickedVersionId(undefined);

  const handleCreate = () => {
    if (!job) return;
    if (versions.length === 0 && kind === 'assessment') {
      setCreating(true);
      void api.get('/assessments/settings/topics')
        .then((res) => res?.data ?? null, () => null)
        .then((topics) => setCreatingFirst({ topics }))
        .finally(() => setCreating(false));
      return;
    }
    if (versions.length === 0) {
      setWizardHref(createPageHref(kind, job.jdId, job.jdTitle, returnUrl));
      return;
    }
    const latest = versions[0];
    setConfirm({
      title: `Create v${nextVersionNumber(versions)}?`,
      message: `A draft copy of v${latest.version} (${latest.name}). v${latest.version} is not changed. Edit and publish the draft before sending it.`,
      confirmText: 'Create Version',
      run: async () => {
        setCreating(true);
        try {
          const fresh = (await reload()) ?? versions;
          const why = createBlockedReason(fresh, perms, kind);
          if (why) { toast.error(why); return; }
          const draftId = await duplicateVersion(fresh[0]);
          toast.success(`v${nextVersionNumber(fresh)} created as a draft.`);
          const listed = await reload();
          const draft = listed?.find((v) => v.id === draftId);
          if (kind === 'assessment' && draft) {
            try {
              setEditing(await loadAssessmentForPopup(draft, 'edit'));
            } catch (err) {
              toast.error((err as Error)?.message || 'Could not load the assessment. Please try again.');
            }
          } else if (draft) {
            setWizardHref(await versionHref(draft, 'edit', job.jdTitle, returnUrl));
          }
        } finally {
          setCreating(false);
        }
      },
    });
  };

  const handleAction = (v: InviteVersion, item: VersionActionItem) => {
    if (item.disabledReason || !job) return;
    if ((item.action === 'view' || item.action === 'edit') && v.kind === 'assessment') {
      const open = item.action === 'view' ? setViewing : setEditing;
      setBusyId(v.id);
      void loadAssessmentForPopup(v, item.action)
        .then(open, (err: unknown) => {
          toast.error((err as Error)?.message || 'Could not load the assessment. Please try again.');
          if (item.action === 'edit') void reload();
        })
        .finally(() => setBusyId(null));
      return;
    }
    if (item.action === 'view' && v.kind === 'interview') {
      setViewingInterviewId(v.id);
      return;
    }
    if (item.action === 'view' || item.action === 'edit') {
      setBusyId(v.id);
      void versionHref(v, item.action, job.jdTitle, returnUrl)
        .then(setWizardHref)
        .finally(() => setBusyId(null));
      return;
    }
    if (!item.confirm) return;
    setConfirm({
      ...item.confirm,
      run: async () => {
        setBusyId(v.id);
        try {
          if (item.action === 'delete') {
            await deleteVersion(v);
            toast.success(`v${v.version} deleted.`);
          } else if (item.action === 'duplicate') {
            const fresh = (await reload()) ?? versions;
            const why = createBlockedReason(fresh, perms, kind, fresh.find((x) => x.id === v.id) ?? v);
            if (why) { toast.error(why); return; }
            await duplicateVersion(v);
            toast.success(`v${nextVersionNumber(fresh)} created as a draft copy of v${v.version}.`);
          } else {
            const action = item.action as 'publish' | 'pause' | 'archive' | 'unarchive';
            await runVersionAction(v, action);
            toast.success(`v${v.version} ${{ publish: 'published', pause: 'paused', archive: 'archived', unarchive: 'unarchived' }[action]}.`);
          }
          await reload();
        } finally {
          setBusyId(null);
        }
      },
    });
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      await confirm.run();
      setConfirm(null);
    } catch (err) {
      toast.error(friendlyErrorMessage(err, `Couldn't ${confirm.confirmText.toLowerCase()}. Please try again.`));
    } finally {
      setConfirmBusy(false);
    }
  };

  /* Per-row Copy Link (Manual cards): this version's invitation for one
     candidate, created without an email. */
  const copyLinkFor = async (c: { name: string; email: string }): Promise<string> => {
    if (!selected?.sendable) throw new Error(`Select ${label.singular === 'Assessment' ? 'an assessment' : 'an AI interview'} version first.`);
    const data = { candidate_name: c.name, candidate_email: c.email, expiry_days: expiryDays };
    const res = kind === 'assessment'
      ? await assessmentService.createInviteLink(selected.id, data)
      : await aiInterviewService.createInviteLink(selected.id, data);
    onSent?.(kind, 1);
    return res.link;
  };

  /* One background job for everyone: the ticked page candidates and the
     Manual / Excel rows as extras, the Select From picks as the selection. */
  const sendAll = async () => {
    if (!selected || !job) return;
    const ticked: BulkExtraCandidate[] = recipients.map((c) => ({
      name: c.name,
      email: c.email,
      phone: c.phone || undefined,
      resume_id: c.resumeId || undefined,
      invite_source: c.inviteSource || (c.source ? INVITE_SOURCE_BY_TAB[c.source] : undefined),
    }));
    const allExtras = [...ticked, ...extras];
    const started = await bulkInviteService.start(job.jdId, {
      kind,
      version_id: selected.id,
      selection: toRequestSelection(serverSelection),
      extra_candidates: allExtras.length ? allExtras : undefined,
      delivery: 'email',
      message: message.trim() || undefined,
      expiry_days: expiryDays,
    });
    bulkReported.current = false;
    setBulkJob(started);
    bulkTracker?.track(started, { jdTitle: job.jdTitle, jdCode: job.jdCode });
    bodyRef.current?.scrollTo({ top: 0 });
    const queued = started.queued ?? 0;
    if (queued === 0) toast.info('Nothing to send — every selected candidate was skipped (see the reasons below)');
    else toast.success(`Sending ${queued.toLocaleString()} invitation${queued === 1 ? '' : 's'}`);
  };
  const onBulkJobChange = (j: BulkInviteJob) => {
    setBulkJob(j);
    if (j.status === 'queued' || j.status === 'running' || bulkReported.current) return;
    bulkReported.current = true;
    if (j.sent > 0) {
      onSent?.(kind, j.sent);
      if (kind === 'assessment') onAssessmentsSent?.(j.sent);
      else onInterviewsSent?.(j.sent);
    }
    void reload();
  };

  const askSend = () => {
    if (!selected?.sendable || recipientCount === 0) return;
    const scope = serverSelection.mode === 'filter'
      ? ` (everyone matching ${describeFilters(serverSelection.filters) || 'the current tab'})` : '';
    setConfirm({
      title: `Send ${label.singular} V${selected.version}?`,
      message: `Sends ${selected.name} V${selected.version} to ${recipientCount.toLocaleString()} candidate${recipientCount === 1 ? '' : 's'}${scope}. Anyone already invited to this version, team members, repeated emails and candidates without an email are skipped.`,
      confirmText: 'Send Invitations',
      run: sendAll,
    });
  };

  const canSend = !!selected?.sendable && recipientCount > 0 && perms.canInvite && !off && !quotaShort;
  const pickingOff = !selected?.sendable || !perms.canInvite || !!off;

  const footerText = off
    ? ''
    : !job
      ? `Select ${label.singular === 'Assessment' ? 'an assessment' : 'an AI interview'} to continue`
      : bulkJob
        ? (bulkJob.status === 'queued' || bulkJob.status === 'running' ? 'Sending in the background — safe to close' : '')
        : !selected
          ? `Select ${label.singular === 'Assessment' ? 'an assessment' : 'an AI interview'} version to continue`
          : recipientCount === 0
            ? 'Add candidates: tick them, pick them from Select From, or type them in'
            : quotaShort
              ? `Only ${quotaAvailable} unit${quotaAvailable === 1 ? '' : 's'} available for ${recipientCount} candidates`
              : null;

  const Icon = kind === 'assessment' ? ClipboardList : Video;
  const listPicked = kind === 'assessment' ? !!asPick : !!aiPick;

  return (
    <>
      <div
        className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-50 animate-in fade-in duration-200"
        onClick={close}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="version-invite-title"
          className="relative bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-lg md:max-w-2xl lg:max-w-4xl xl:max-w-5xl h-[calc(100dvh-1.5rem)] sm:h-[min(46rem,calc(100dvh-3rem))] max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        >
          <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
                <Icon className="w-4 h-4 text-brand-blue" />
              </div>
              <div className="min-w-0">
                <h2 id="version-invite-title" className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight">
                  Invite to {label.singular}
                </h2>
                {job && (
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-slate-500 min-w-0">
                    {job.jdCode && <JobIdBadge>{job.jdCode}</JobIdBadge>}
                    <span className="min-w-0 truncate">{job.jdTitle}</span>
                    {job.jobVersionNumber ? <VersionChip kind="job" version={job.jobVersionNumber} /> : null}
                    {selected && (
                      <span className="inline-flex items-center gap-1">
                        <span>{label.singular} Version</span>
                        <VersionChip kind="assessment" version={selected.version} />
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            {/* No X — the footer's Cancel closes (the popup standard). */}
          </div>

          <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
            {off ? (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 py-10 px-4 text-center text-sm text-gray-600 dark:text-slate-400">{off}</div>
            ) : !job ? (
              /* No job given: every published one, any job — the pick names
                 the job and the version. */
              jobPickList === null ? (
                <div className="flex items-center justify-center py-12 tf-loader-center tf-loader-center--compact">
                  <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
                </div>
              ) : kind === 'interview' ? (
                <AIInterviewPicker
                  configs={jobPickList as AIInterviewResponse[]}
                  selection={aiPick}
                  onSelectionChange={setAiPick}
                  scrollContainerRef={bodyRef}
                />
              ) : (
                <AssessmentPicker
                  assessments={jobPickList as AssessmentResponse[]}
                  selectedId={asPick?.id ?? null}
                  onSelect={(a) => setAsPick(a as AssessmentResponse | null)}
                  scrollContainerRef={bodyRef}
                />
              )
            ) : bulkJob ? (
              /* The send's live counts and per-candidate rows; the floating
                 widget keeps following it after this popup closes. */
              <BulkInviteProgressPanel jobId={bulkJob.job_id} initialJob={bulkJob} compact onJobChange={onBulkJobChange} />
            ) : (
              <div className="space-y-6">
                {!jdId && (
                  <button
                    type="button"
                    onClick={backToList}
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-blue hover:text-brand-blue-2 hover:underline underline-offset-2"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                    Choose a different {label.singular.toLowerCase()}
                  </button>
                )}
                {versionFixed ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 dark:border-slate-700 px-3 py-2.5">
                    <span className="text-sm text-gray-800 dark:text-slate-200 min-w-0 truncate">
                      <span className="font-medium">{selected?.name}</span>
                      <span className="text-gray-500 dark:text-slate-400"> · V{selected?.version}</span>
                    </span>
                    <button
                      type="button"
                      onClick={showAllVersions}
                      className="text-xs font-medium text-brand-blue hover:text-brand-blue-2 hover:underline underline-offset-2"
                    >
                      Change version
                    </button>
                  </div>
                ) : (
                  <section aria-labelledby="version-heading">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <h3 id="version-heading" className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                        Select {label.singular} Version
                      </h3>
                      {loaded && !error && <VersionUsage kind={kind} used={versions.length} />}
                    </div>
                    <VersionList
                      kind={kind}
                      versions={listedVersions(kind, versions)}
                      allVersions={versions}
                      loading={loading && !loaded}
                      error={error}
                      onRetry={() => void reload()}
                      selectedId={versionId}
                      onSelect={setVersionId}
                      createBlocked={blocked}
                      creating={creating}
                      onCreate={handleCreate}
                      perms={perms}
                      busyId={busyId}
                      onAction={handleAction}
                      hideDuplicate={hideDuplicate}
                    />
                  </section>
                )}
                <InviteQuotaBar kind={kind} onStats={(s) => setQuotaAvailable(s && s.total_quota < 999999 ? s.available : null)} />
                <section aria-label="Send to" className="rounded-xl border border-gray-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 p-3 sm:p-4">
                  <SendToPanel
                    kind={kind}
                    candidates={candidates}
                    selectedIds={candidateIds}
                    onSelectedIds={setCandidateIds}
                    message={message}
                    onMessage={(m) => { messageTouched.current = true; setMessage(m); }}
                    expiryDays={expiryDays}
                    onExpiry={setExpiryDays}
                    listSlot={(
                      <div className="space-y-4">
                        {/* Manual first: it is open with an empty row on every opening. */}
                        <ExtraCandidatesInput onChange={setExtras} disabled={pickingOff} onCopyLink={copyLinkFor} />
                        <ServerCandidatePicker
                          jdId={job.jdId}
                          kind={kind}
                          versionId={selected?.sendable ? selected.id : null}
                          selection={serverSelection}
                          onSelectionChange={setServerSelection}
                          pickingDisabled={pickingOff}
                        />
                      </div>
                    )}
                  />
                </section>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-6 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 shrink-0">
            <div className="min-w-0 sm:truncate sm:whitespace-nowrap text-sm text-gray-700 dark:text-slate-300">
              {footerText ?? (selected && (
                <span className="inline-flex items-center gap-1.5 align-middle">
                  <CheckCircle className="w-4 h-4 text-brand-blue flex-shrink-0" />
                  Ready to invite {recipientCount.toLocaleString()} candidate{recipientCount === 1 ? '' : 's'} to {label.singular} V{selected.version}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 w-full sm:w-auto">
              {bulkJob ? (
                <button
                  onClick={onClose}
                  className="col-span-2 flex items-center justify-center gap-2 px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-colors shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
                >
                  Done
                </button>
              ) : (
                <>
                  <Button variant="secondary" onClick={close} className="!h-9 w-full">
                    Cancel
                  </Button>
                  {!job && !off ? (
                    <button
                      onClick={chooseFromList}
                      disabled={!listPicked}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-colors shadow-md shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Continue
                    </button>
                  ) : (
                    <button
                      onClick={askSend}
                      aria-disabled={!canSend}
                      disabled={!canSend && perms.canInvite}
                      title={deniedTitle}
                      className={`w-full flex items-center justify-center gap-2 px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-colors shadow-md shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed ${!perms.canInvite ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <Mail className="w-4 h-4" />
                      {selected ? `Send with V${selected.version}` : 'Send Invitations'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {confirm && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-[1px] p-4 sm:p-6">
              <div role="alertdialog" aria-modal="true" aria-labelledby="version-invite-confirm" className="w-full max-w-md rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-4 sm:p-5">
                <h3 id="version-invite-confirm" className="text-base font-semibold text-gray-900 dark:text-slate-50">{confirm.title}</h3>
                <p className="mt-1.5 text-sm text-gray-600 dark:text-slate-400">{confirm.message}</p>
                <div className="mt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setConfirm(null)} disabled={confirmBusy}>Cancel</Button>
                  <Button
                    variant={confirm.destructive ? 'destructive' : 'primary'}
                    size="sm"
                    onClick={() => void runConfirm()}
                    disabled={confirmBusy}
                    icon={confirmBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}
                    autoFocus
                  >
                    {confirm.confirmText}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {viewing && (
        <AssessmentPreviewModal
          isOpen
          onClose={() => setViewing(null)}
          assessment={viewing}
          jobContext={{ jobVersionNumber: job?.jobVersionNumber }}
        />
      )}
      {viewingInterviewId && (
        <ConfigurePreviewDialog configId={viewingInterviewId} onClose={() => setViewingInterviewId(null)} cancelInFooter />
      )}
      {editing && (
        <AssessmentConfigureModal
          isOpen
          onClose={() => setEditing(null)}
          assessment={editing}
          onSaved={() => void fetchVersions()}
        />
      )}
      {wizardHref && job && (
        <AIInterviewWizardDialog
          startHref={wizardHref}
          jdCode={job.jdCode}
          jdTitle={job.jdTitle}
          onClose={() => {
            setWizardHref(null);
            void fetchVersions();
          }}
        />
      )}
      {creatingFirst && job && (
        <AssessmentConfigureModal
          isOpen
          create
          topicSettings={creatingFirst.topics ?? undefined}
          onClose={() => setCreatingFirst(null)}
          assessment={{ jd_id: job.jdId, jd_short_id: job.jdCode, jd_title: job.jdTitle, jd_version: job.jobVersionNumber }}
          onSaved={() => void fetchVersions()}
        />
      )}
    </>
  );
}
