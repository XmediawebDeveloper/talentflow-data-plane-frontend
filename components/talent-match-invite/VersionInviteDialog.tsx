'use client';

import { Fragment, useEffect, useEffectEvent, useId, useRef, useState, type ComponentProps } from 'react';
import { AlertTriangle, ArrowLeft, Check, ClipboardList, Info, Loader2, Mail, Video, X } from 'lucide-react';
import { toast } from 'sonner';
import { usePathname } from 'next/navigation';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/hooks/useAuth';
import api from '@/lib/services/api';
import VersionList, { STATUS_PILL, VersionTitle, VersionUsage } from './VersionList';
import ServerCandidatePicker, { EMPTY_SELECTION, TAB_LABEL, selectionCount, toRequestSelection, type PickerSelection } from './ServerCandidatePicker';
import ExtraCandidatesInput, { MAX_EXTRA_CANDIDATES, type ExtraCounts, type ExtraMode } from './ExtraCandidatesInput';
import InviteQuotaBar, { isUnlimitedQuota } from './InviteQuotaBar';
import InviteReviewStep, { type LeftOut, type ReviewCounts } from './InviteReviewStep';
import InviteMessageStep from './InviteMessageStep';
import { DEFAULT_EXPIRY_DAYS, defaultInviteMessage } from './inviteDefaults';
import BulkInviteProgressPanel from '@/components/bulk-invite/BulkInviteProgressPanel';
import { bulkInviteService, type BulkInviteJob, type BulkExtraCandidate, type BulkInviteSelection } from '@/lib/services/bulkInviteService';
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
import { AssessmentJobStatusBadge } from '@/components/assessments/AllAssessmentsTable';
import { useJobLockBadges } from '@/lib/hooks/useJobLockBadges';
import { assessmentJobLockMessage } from '@/lib/utils/assessmentJobLock';
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
  loadJobAssessmentVersions,
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
  cancelText?: string;
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

type Step = 'version' | 'candidates' | 'review' | 'send';
const STEP_LABEL: Record<Exclude<Step, 'version'>, string> = {
  candidates: 'Add candidates',
  review: 'Review candidates',
  send: 'Message and send',
};
const stepLabel = (s: Step, singular: string) => (s === 'version' ? singular : STEP_LABEL[s]);

/* The page's sections: an intro over each step, a white block. */
const INTRO_H = 'text-base font-semibold text-gray-900 dark:text-slate-50';
const INTRO_P = 'mt-1 text-sm text-gray-600 dark:text-slate-400';
const BLOCK = 'rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4';

/** A candidate's identity in the review — the backend's `review_key`. */
const reviewKey = (c: { resume_id?: string | null; email?: string | null }) =>
  c.resume_id ? String(c.resume_id) : `email:${(c.email || '').trim().toLowerCase()}`;

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/**
 * THE invite popup — every Invite / Send / Invite More / Share / Create /
 * Send button for an Assessment or an AI Interview opens this one component
 * (through `InviteDialogProvider`'s `useInviteDialog().open(...)`, or the
 * hosts that mount it). Change it here and every place follows.
 *
 * Steps (the ones the opening needs):
 *  1. Version — the version cards with create / view / edit and the rest.
 *     Left out when the button fixed the version ("Change version" brings it).
 *  2. Candidates — add by email (typed or Excel, per-row Copy Link) and pick
 *     from the job's lists and the resume database (server-paged).
 *  3. Review — everyone the send names, as the server plans it: who is
 *     invited, who is skipped and why; untick to leave someone out. The
 *     page's own ticked candidates land here directly.
 *  4. Message — the email (template) and link expiry, then Send.
 * With no job given it first lists every published assessment / AI
 * interview. Send starts one background job (POST /jd/{id}/bulk-invites)
 * whose progress replaces the body and survives closing the popup.
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
   *  the Version step is left out. Omitted: the cards, newest sendable ticked. */
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
  /** Include every page candidate on open. False = listed, left out. */
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
  const article = label.singular === 'Assessment' ? 'an assessment' : 'an AI interview';
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
  /* The job's Disabled / Archived / Draft badge beside its name — the
     Assessments page's — kept live while the popup is open. Assessment
     invites only. A Disabled / Archived job takes no invites: Send is held,
     with the Assessments page's lock message, until the job is re-enabled /
     unarchived, which this picks up without reopening. */
  const { badgeFor: jobBadgeFor } = useJobLockBadges(kind === 'assessment' ? [job?.jdId] : []);
  const headerJobBadge = kind === 'assessment' ? jobBadgeFor(job?.jdId) : null;
  const jobLock = assessmentJobLockMessage(headerJobBadge);

  const [versions, setVersions] = useState<InviteVersion[]>([]);
  /* Picked from the list (no job given): the version cards span every job
     version of the picked JOB, not just the one job version picked — Change
     version can switch to any of them. `versions` stays that job version's own
     (usage, cap, New version); null when the cards are not job-wide. */
  const spansJob = kind === 'assessment' && !jdId;
  const [jobWideVersions, setJobWideVersions] = useState<InviteVersion[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(!off && !!job);
  const [error, setError] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  /* The page's candidates with an email go straight into the send (no email,
     no invite — said once in Review). `preselect` false lists them left out. */
  const recipients = candidates.filter((c) => c.email);
  const noEmailCount = candidates.length - recipients.length;
  const [leftOut, setLeftOut] = useState<LeftOut>(() => (
    preselect ? {} : Object.fromEntries(recipients.map((c) => [reviewKey({ resume_id: c.resumeId, email: c.email }), 'extra' as const]))
  ));
  const [reviewCounts, setReviewCounts] = useState<ReviewCounts | null>(null);
  const [message, setMessage] = useState('');
  const messageTouched = useRef(false);
  const [expiryDays, setExpiryDays] = useState(DEFAULT_EXPIRY_DAYS);
  const [quotaAvailable, setQuotaAvailable] = useState<number | null>(null);
  const [quotaUnlimited, setQuotaUnlimited] = useState(false);
  /* Pick from lists: the picked rows or the filter — never the rows themselves. */
  const [serverSelection, setServerSelection] = useState<PickerSelection>(EMPTY_SELECTION);
  /* Added by email (typed / Excel). */
  const [extras, setExtras] = useState<BulkExtraCandidate[]>([]);
  const [extraCounts, setExtraCounts] = useState<ExtraCounts>({ manual: 0, excel: 0 });
  /* The candidates step's open tab when it is Type in / Upload Excel (null =
     one of the lists), and a key that empties what was added directly. */
  const [addTab, setAddTab] = useState<ExtraMode | null>(null);
  const [extrasKey, setExtrasKey] = useState(0);
  /* The candidates step, once opened, stays mounted (hidden on other steps). */
  const [candidatesMounted, setCandidatesMounted] = useState(false);
  /* Bumped when a Copy Link uses a unit: the units are read again. */
  const [quotaKey, setQuotaKey] = useState(0);
  /* The version changed after candidates were added: "already invited" is
     per version, so the review re-checks it — said once, dismissible. */
  const [verNote, setVerNote] = useState<string | null>(null);
  const [bulkJob, setBulkJob] = useState<BulkInviteJob | null>(null);
  const [sending, setSending] = useState(false);
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
  /* Phones scroll the whole popup in the steps, not just the body. */
  const dialogRef = useRef<HTMLDivElement | null>(null);
  /* Assessment View / Edit and the AI interview preview, over this popup. */
  const [viewing, setViewing] = useState<AssessmentResponse | null>(null);
  const [editing, setEditing] = useState<AssessmentResponse | null>(null);
  const [viewingInterviewId, setViewingInterviewId] = useState<string | null>(null);
  const preselected = useRef(false);
  /* A resume / versions popup open over a step: Esc closes it, not this. */
  const childOverlay = useRef<(() => void) | null>(null);
  const onOverlayChange = (close: (() => void) | null) => { childOverlay.current = close; };
  const lastLoadedAt = useRef(0);

  const applyVersions = (next: InviteVersion[], wide?: InviteVersion[] | null) => {
    lastLoadedAt.current = Date.now();
    setVersions(next);
    if (wide !== undefined) setJobWideVersions(wide);
    // A pick may be any card listed, so it stays valid against the job-wide set.
    const pool = wide ?? next;
    setLoaded(true);
    setLoading(false);
    setError(null);
    const firstLoad = !preselected.current;
    preselected.current = true;
    const listed = listedVersions(kind, next);
    if (firstLoad) {
      // The button's own version first; else the newest sendable one.
      const fixed = pickedVersionId ? next.find((v) => v.id === pickedVersionId && v.sendable) : undefined;
      const chosen = fixed ?? listed.find((v) => v.sendable);
      // Open where the work is: the page's candidates → Review; a fixed
      // version → Candidates; else the Version step.
      setStep(!chosen ? 'version' : recipients.length > 0 ? 'review' : fixed ? 'candidates' : 'version');
    }
    setVersionId((cur) => {
      if (cur && pool.some((v) => v.id === cur && v.sendable)) return cur;
      if (firstLoad) {
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
    setStep('version');
    setError((err as Error)?.message || `Could not load ${label.singular.toLowerCase()} versions.`);
    return null;
  };
  const fetchVersions = (): Promise<InviteVersion[] | null> => {
    if (!job) return Promise.resolve(null);
    if (!spansJob) return loadVersions(kind, job.jdId).then((own) => applyVersions(own), applyLoadError);
    return Promise.all([loadVersions(kind, job.jdId), loadJobAssessmentVersions(job.jdId).catch(() => null)])
      .then(([own, wide]) => applyVersions(own, wide), applyLoadError);
  };
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
  const selected = (jobWideVersions ?? versions).find((v) => v.id === versionId) ?? null;
  const template = job
    ? defaultInviteMessage(kind, {
        jobTitle: job.jdTitle || selected?.config?.jd_title || selected?.raw?.jd_title,
        companyName: (user as { tenantName?: string } | null)?.tenantName,
        location: selected?.config?.jd_location,
      })
    : '';
  useEffect(() => {
    if (!job || messageTouched.current) return;
    setMessage(template);
  }, [job, template]);

  /* The version is fixed when the button named it and it can still be sent. */
  const versionFixed = !!pickedVersionId && !!selected && selected.id === pickedVersionId && selected.sendable;
  const steps: Step[] = versionFixed ? ['candidates', 'review', 'send'] : ['version', 'candidates', 'review', 'send'];
  const current: Step = step && steps.includes(step) ? step : steps[0];
  const stepIndex = steps.indexOf(current);
  const goTo = (s: Step) => {
    setStep(s);
    bodyRef.current?.scrollTo({ top: 0 });
    dialogRef.current?.scrollTo({ top: 0 });
  };

  const addedCount = selectionCount(serverSelection) + extras.length;
  const recipientCount = recipients.length + addedCount;

  /* Picking another version once candidates are in: say the review re-checks them. */
  const pickVersion = (id: string | null) => {
    if (id && versionId && id !== versionId && recipientCount > 0) {
      const v = (jobWideVersions ?? versions).find((x) => x.id === id);
      if (v) setVerNote(`${label.singular} version changed to v${v.version}. Invited status is re-checked for everyone selected; anyone already invited to v${v.version} will be skipped.`);
    }
    setVersionId(id);
  };

  const blocked = createBlockedReason(versions, perms, kind);
  const returnUrl = job ? `/recruitment/job-details?id=${encodeURIComponent(job.jdId)}` : '/recruitment/job-openings';
  // What will be sent: the review's count once it has one, else everyone added.
  const willInvite = reviewCounts && (current === 'review' || current === 'send') ? reviewCounts.invite : recipientCount;
  const quotaShort = quotaAvailable !== null && willInvite > quotaAvailable;
  /* How many more can be added on the candidates step: the units left after
     everyone added so far. Null = no limit (unlimited plan, or the units
     could not be read — the server checks at send). */
  const unitsRoom = quotaAvailable === null ? null : quotaAvailable - recipientCount;
  /* How many typed-in / Excel rows fit: the units available (or the backend's
     per-send cap on unlimited plans), less everyone already picked elsewhere. */
  const extraLimitByUnits = !quotaUnlimited && quotaAvailable !== null && quotaAvailable < MAX_EXTRA_CANDIDATES;
  const extraMaxRows = Math.max(
    0,
    (extraLimitByUnits ? quotaAvailable! : MAX_EXTRA_CANDIDATES) - recipients.length - selectionCount(serverSelection),
  );
  const unitsTone = unitsRoom === null || unitsRoom > 0
    ? { bar: 'bg-brand-blue', text: 'text-gray-600 dark:text-slate-300' }
    : unitsRoom === 0
      ? { bar: 'bg-warning', text: 'font-medium text-warning-strong' }
      : { bar: 'bg-destructive', text: 'font-medium text-destructive' };
  /* Emails added directly — a list row with one of them is not ticked again. */
  const addedEmails = new Set(extras.map((x) => x.email.trim().toLowerCase()));
  const clearCandidates = () => {
    setServerSelection(EMPTY_SELECTION);
    setExtras([]);
    setExtraCounts({ manual: 0, excel: 0 });
    setExtrasKey((k) => k + 1);
  };
  if (current === 'candidates' && !candidatesMounted) setCandidatesMounted(true);

  /* Closing with candidates added asks first — they would be lost. */
  const askDiscard = () => setConfirm({
    title: `Discard ${plural(addedCount, 'selected candidate')}?`,
    message: 'Closing now loses everyone you have picked. This cannot be undone.',
    confirmText: 'Discard and close',
    cancelText: 'Keep editing',
    destructive: true,
    run: async () => onClose(),
  });
  const requestClose = () => {
    if (confirmBusy) return;
    if (!bulkJob && addedCount > 0) {
      askDiscard();
      return;
    }
    onClose();
  };

  /* The browser's Back button closes the popup, not the page under it.
     Opening adds a history entry on the same URL (Next's own state copied
     in, so its router reads it as this page); Back pops it and lands here:
     the top layer closes (resume / versions preview, View, the confirm), or
     with candidates added the discard question opens — both put the entry
     back so the next Back is caught too — else the popup closes. Closing any
     other way takes the entry off again. The footer's Back moves between
     steps; the browser's does not. */
  const guardId = useRef(`invite${useId()}`);
  const mounted = useRef(false);
  const onGuardEntry = () => (window.history.state as { tfInvite?: string } | null)?.tfInvite === guardId.current;
  /* Whether the popup's entry is on the stack, and the address it was added
     on — Next rewrites the current entry's state after a Back, so the tag
     alone cannot say whether the entry is still there. */
  const guard = useRef<{ active: boolean; href: string }>({ active: false, href: '' });
  const pushGuard = () => {
    if (guard.current.active && onGuardEntry()) return;
    window.history.pushState({ ...(window.history.state ?? {}), tfInvite: guardId.current }, '', window.location.href);
    guard.current = { active: true, href: window.location.href };
  };
  const onBrowserBack = useEffectEvent(() => {
    if (onGuardEntry()) return; // Forward onto the popup's own entry: nothing to undo.
    guard.current.active = false;
    if (childOverlay.current) { childOverlay.current(); pushGuard(); return; }
    if (viewing) { setViewing(null); pushGuard(); return; }
    if (viewingInterviewId) { setViewingInterviewId(null); pushGuard(); return; }
    // An editor over the popup keeps its unsaved work: Back is held.
    if (editing || creatingFirst || wizardHref) { pushGuard(); return; }
    if (confirm) { if (!confirmBusy) setConfirm(null); pushGuard(); return; }
    if (!bulkJob && addedCount > 0) { pushGuard(); askDiscard(); return; }
    onClose();
  });
  useEffect(() => {
    mounted.current = true;
    pushGuard();
    const onPop = () => onBrowserBack();
    window.addEventListener('popstate', onPop);
    return () => {
      mounted.current = false;
      window.removeEventListener('popstate', onPop);
      // Closed by Cancel / Done / Discard: take the popup's entry off, so the
      // next Back goes back a page. A remount in the same tick keeps it.
      // A link that left the page moved the address: its entry is left alone.
      setTimeout(() => {
        if (mounted.current || !guard.current.active) return;
        guard.current.active = false;
        if (window.location.href === guard.current.href) window.history.back();
      }, 0);
    };
    // Once per opening; the handlers read the latest state themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* The page changed under the popup some other way (a sidebar or logo
     link): close it — or, with candidates added, ask first. */
  const pathname = usePathname();
  const [seenPath, setSeenPath] = useState(pathname);
  const [routeLeft, setRouteLeft] = useState(false);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    if (!bulkJob && addedCount > 0) askDiscard();
    else setRouteLeft(true);
  }
  const closeOnRouteLeft = useEffectEvent(() => onClose());
  useEffect(() => { if (routeLeft) closeOnRouteLeft(); }, [routeLeft]);

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
    if (childOverlay.current) { childOverlay.current(); return; }
    if (viewing) { setViewing(null); return; }
    if (viewingInterviewId) return;
    if (editing || creatingFirst || wizardHref) return;
    if (confirm && !confirmBusy) setConfirm(null);
    else requestClose();
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
    setStep(null);
    setLoading(true);
    bodyRef.current?.scrollTo({ top: 0 });
  };
  const backToList = () => {
    setJob(null);
    setPickedVersionId(undefined);
    setVersions([]);
    setJobWideVersions(null);
    setVersionId(null);
    setLoaded(false);
    setStep(null);
    clearCandidates();
    setCandidatesMounted(false);
    setAddTab(null);
    setVerNote(null);
    messageTouched.current = false;
  };
  /* "Change version": the Version step comes back. */
  const changeVersion = () => {
    setPickedVersionId(undefined);
    goTo('version');
  };

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
              toast.error(friendlyErrorMessage(err, 'Could not load the assessment. Please try again.'));
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
          toast.error(friendlyErrorMessage(err, 'Could not load the assessment. Please try again.'));
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

  /* Per-row Copy Link (added by email): this version's invitation for one
     candidate, created without an email. */
  const copyLinkFor = async (c: { name: string; email: string }): Promise<string> => {
    if (!selected?.sendable) throw new Error(`Select ${article} version first.`);
    const data = { candidate_name: c.name, candidate_email: c.email, expiry_days: expiryDays };
    const res = kind === 'assessment'
      ? await assessmentService.createInviteLink(selected.id, data)
      : await aiInterviewService.createInviteLink(selected.id, data);
    onSent?.(kind, 1);
    setQuotaKey((k) => k + 1);
    return res.link;
  };

  /* An email typed in that is already picked elsewhere — said at once. */
  const takenEmail = (email: string): string | null => {
    if (recipients.some((c) => c.email.trim().toLowerCase() === email)) return 'this page';
    if (serverSelection.mode === 'ids') {
      const hit = Object.values(serverSelection.picked).find((x) => x.email.trim().toLowerCase() === email);
      if (hit) return TAB_LABEL[hit.source];
    }
    return null;
  };

  /* The send as it stands: the page's candidates and the typed / Excel rows
     as extras, the list picks as the selection. */
  const allExtras: BulkExtraCandidate[] = [
    ...recipients.map((c) => ({
      name: c.name,
      email: c.email,
      phone: c.phone || undefined,
      resume_id: c.resumeId || undefined,
      invite_source: c.inviteSource || (c.source ? INVITE_SOURCE_BY_TAB[c.source] : undefined),
    })),
    ...extras,
  ];
  const sendableId = selected?.sendable ? selected.id : null;
  // The Review step keys its fetch on this request's content, not its identity.
  const reviewRequest = sendableId ? {
    kind,
    version_id: sendableId,
    selection: toRequestSelection(serverSelection),
    extra_candidates: allExtras.length ? allExtras : undefined,
  } : null;

  /* One background job for everyone, minus the rows left out in Review. */
  const sendAll = async () => {
    if (!selected || !job || !reviewRequest || sending) return;
    const outList = new Set(Object.entries(leftOut).filter(([, o]) => o === 'list').map(([k]) => k));
    const outExtra = new Set(Object.entries(leftOut).filter(([, o]) => o === 'extra').map(([k]) => k));
    const sel = reviewRequest.selection;
    const selection: BulkInviteSelection = sel.mode === 'ids'
      ? { mode: 'ids', resume_ids: sel.resume_ids.filter((id) => !outList.has(id)) }
      : { ...sel, exclude_ids: [...sel.exclude_ids, ...outList] };
    const kept = allExtras.filter((c) => !outExtra.has(reviewKey(c)));
    setSending(true);
    try {
      // The selected version's own job version — a job-wide pick may sit on
      // another job version than the one first picked.
      const started = await bulkInviteService.start(selected.jdId || job.jdId, {
        kind,
        version_id: selected.id,
        selection,
        extra_candidates: kept.length ? kept : undefined,
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
      else toast.success(`Sending ${plural(queued, 'invitation')}`);
    } catch (err) {
      toast.error(friendlyErrorMessage(err, 'Could not start sending. Please try again.'));
    } finally {
      setSending(false);
    }
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

  const pickingOff = !selected?.sendable || !perms.canInvite || !!off;
  const emptyMessage = !message.trim();
  const canSend = !!selected?.sendable && !!reviewCounts && reviewCounts.invite > 0 && perms.canInvite && !off && !quotaShort && !jobLock && !emptyMessage;
  const shortBy = quotaAvailable !== null ? Math.max(0, willInvite - quotaAvailable) : 0;
  const versionTag = selected ? `${label.singular} v${selected.version}` : label.singular;
  const selectedNow = reviewCounts ? reviewCounts.all - reviewCounts.left_out : recipientCount;
  const totalNow = reviewCounts ? reviewCounts.all : recipientCount;

  /* The footer's one line: what holds the next step, else where things stand. */
  const footerText = off
    ? ''
    : !job
      ? `Select ${article} to continue`
      : bulkJob
        ? (bulkJob.status === 'queued' || bulkJob.status === 'running' ? 'Sending in the background — safe to close' : '')
        : !loaded
          ? ''
          : jobLock
            ? jobLock
            : current === 'version'
              ? (!selected?.sendable ? `Select ${article} version to continue` : `${versionTag} picked`)
              : deniedTitle
                ? deniedTitle
              : current === 'candidates' && recipientCount === 0
                ? 'Add at least one candidate to continue'
                : current === 'review' && reviewCounts && selectedNow === 0
                  ? 'Select at least one candidate to continue'
                  : (current === 'review' || current === 'send') && quotaShort
                    ? `Deselect ${shortBy.toLocaleString()} ${shortBy === 1 ? 'candidate' : 'candidates'} or add units to continue`
                    : current === 'send' && emptyMessage
                      ? 'Write a message to continue'
                      : `${selectedNow.toLocaleString()} of ${totalNow.toLocaleString()} selected · ${versionTag}`;

  /* What each step needs before the next one opens. */
  const stepReady = (s: Step): boolean => s === 'version'
    ? !!selected?.sendable
    : s === 'candidates'
      ? recipientCount > 0 && !pickingOff
      : s === 'review'
        ? !!reviewCounts && reviewCounts.invite > 0 && !quotaShort && !jobLock && perms.canInvite
        : canSend;
  const nextDisabled = current === 'send' ? !canSend || sending : !stepReady(current);
  /* A step can be opened from the bar once every step before it is ready. */
  const reachable = (i: number) => steps.slice(0, i).every(stepReady);
  const nextStep = steps[stepIndex + 1];
  const primaryLabel = current === 'send'
    ? (reviewCounts && reviewCounts.invite > 0 ? `Send to ${plural(reviewCounts.invite, 'candidate')}` : 'Send')
    : nextStep === 'review'
      ? `Next: Review ${recipientCount ? `${plural(recipientCount, 'candidate')}` : 'candidates'}`
      : nextStep === 'send'
        ? 'Next: Message'
        : `Next: ${stepLabel(nextStep, label.singular)}`;
  const onPrimary = () => {
    if (nextDisabled) return;
    if (current === 'send') void sendAll();
    else goTo(nextStep);
  };

  const Icon = kind === 'assessment' ? ClipboardList : Video;
  const listPicked = kind === 'assessment' ? !!asPick : !!aiPick;
  const inSteps = !off && !!job && !bulkJob && loaded;
  const unitsAfter = reviewCounts && quotaAvailable !== null ? quotaAvailable - reviewCounts.invite : null;
  const latestId = (jobWideVersions ?? listedVersions(kind, versions))[0]?.id;
  const jobName = job ? job.jdTitle || selected?.raw?.jd_title || selected?.name || '' : '';
  const pickedName = selected ? `${jobName || selected.name} · v${selected.version}` : '—';
  const alerts: { tone: 'warn' | 'info' | 'danger'; text: string; onDismiss?: () => void }[] = [];
  if (inSteps && deniedTitle) {
    alerts.push({ tone: 'warn', text: !inviteAllowed && inviteDeniedReason ? inviteDeniedReason : `Sending invites needs the Invite permission for ${label.plural}. Ask a workspace admin.` });
  }
  if (inSteps && verNote) alerts.push({ tone: 'info', text: verNote, onDismiss: () => setVerNote(null) });
  if (inSteps && quotaShort && current !== 'version') {
    alerts.push({ tone: 'danger', text: `Only ${plural(quotaAvailable ?? 0, 'unit')} ${quotaAvailable === 1 ? 'is' : 'are'} available for ${plural(willInvite, 'candidate')}. Deselect ${shortBy.toLocaleString()} to continue, or add units.` });
  }
  if (inSteps && current === 'candidates' && !quotaShort && unitsRoom === 0) {
    alerts.push({
      tone: 'warn',
      text: recipientCount === 0
        ? `No ${label.singular} units left. Add units to invite candidates.`
        : `Units full (${recipientCount.toLocaleString()}/${(quotaAvailable ?? 0).toLocaleString()}). Remove someone to add more.`,
    });
  }
  const ALERT_TONE = {
    warn: 'border-warning-line bg-warning-subtle text-warning-strong',
    info: 'border-brand-blue/20 bg-brand-blue/[0.06] text-brand-blue',
    danger: 'border-destructive-line bg-destructive-subtle text-destructive',
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-50 animate-in fade-in duration-200"
        onClick={requestClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="version-invite-title"
          className={`${inSteps ? 'max-sm:overflow-y-auto max-sm:overscroll-contain' : ''} relative bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-lg md:max-w-2xl lg:max-w-5xl xl:max-w-[70rem] 2xl:max-w-[75rem] h-[calc(100dvh-1.5rem)] sm:h-[min(48rem,calc(100dvh-3rem))] 2xl:h-[min(50rem,calc(100dvh-3rem))] max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200`}
        >
          {/* Header: what this is, and the units it spends. No X — the
              footer's Cancel closes (the popup standard). */}
          <div className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-3.5 border-b border-gray-100 dark:border-slate-700/60">
            <div className="flex items-center gap-3 min-w-0">
              <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
                <Icon className="w-4 h-4 text-brand-blue" />
              </div>
              <div className="min-w-0">
                <h2 id="version-invite-title" className="tf-section-title">
                  Invite to {label.singular}
                </h2>
                <p className="tf-meta">Send the {label.singular.toLowerCase()} link to candidates</p>
              </div>
            </div>
            {!off && (
              <InviteQuotaBar
                kind={kind}
                refreshKey={quotaKey}
                onStats={(s) => {
                  setQuotaUnlimited(isUnlimitedQuota(s));
                  setQuotaAvailable(s && !isUnlimitedQuota(s) ? s.available : null);
                }}
              />
            )}
          </div>

          {inSteps && (
            <>
              {/* Steps — any step whose earlier steps are ready opens from here. */}
              <nav aria-label="Steps" className="flex-shrink-0 max-sm:sticky max-sm:top-0 max-sm:z-10 bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700/60 px-4 sm:px-6 py-3 overflow-x-auto">
                <ol className="flex min-w-max sm:min-w-0 items-center gap-2">
                  {steps.map((s, i) => {
                    const done = i < stepIndex;
                    const here = i === stepIndex;
                    const open = !here && reachable(i);
                    return (
                      <Fragment key={s}>
                        {i > 0 && <li aria-hidden="true" className={`h-px flex-1 min-w-6 ${done || here ? 'bg-brand-blue/40' : 'bg-gray-200 dark:bg-slate-700'}`} />}
                        <li>
                          <button
                            type="button"
                            onClick={() => { if (open) goTo(s); }}
                            disabled={!open}
                            aria-current={here ? 'step' : undefined}
                            className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-sm whitespace-nowrap disabled:cursor-default ${
                              here ? 'font-semibold text-gray-900 dark:text-slate-50' : open ? 'font-medium text-brand-blue hover:underline underline-offset-2' : 'font-medium text-gray-400 dark:text-slate-500'
                            }`}
                          >
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                              here || done ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400'
                            }`}>
                              {done ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : i + 1}
                            </span>
                            <span className={here ? '' : 'max-sm:hidden'}>{stepLabel(s, label.singular)}</span>
                          </button>
                        </li>
                      </Fragment>
                    );
                  })}
                </ol>
              </nav>

              {/* The version being sent, pinned under the steps. */}
              {selected && (
                <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 sm:px-6 py-2.5 bg-brand-blue/[0.03] dark:bg-slate-800/40 border-b border-brand-blue/10 dark:border-slate-700/60">
                  <span className="min-w-0 flex flex-wrap items-center gap-2">
                    <VersionTitle version={selected} compact spansJobVersions={!!jobWideVersions} />
                    {selected.id === latestId && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded-md text-2xs font-semibold uppercase tracking-wide text-white bg-brand-blue ring-1 ring-white/10">Latest</span>
                    )}
                    <span className={`shrink-0 inline-flex text-2xs font-semibold px-2 py-0.5 rounded-md ring-1 ${STATUS_PILL[selected.status]}`}>{selected.statusLabel}</span>
                    {headerJobBadge && <AssessmentJobStatusBadge kind={headerJobBadge} />}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    {!jdId && (
                      <button type="button" onClick={backToList} className="inline-flex items-center gap-1 text-xs font-medium text-brand-blue hover:text-brand-blue-2 hover:underline underline-offset-2">
                        <ArrowLeft className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                        Choose a different {label.singular.toLowerCase()}
                      </button>
                    )}
                    {current !== 'version' && (
                      <button type="button" onClick={changeVersion} className="h-8 px-3 rounded-lg text-xs font-medium border border-brand-blue/30 text-brand-blue bg-brand-blue/5 hover:bg-brand-blue/10">
                        Change version
                      </button>
                    )}
                  </span>
                </div>
              )}
            </>
          )}

          <div className={`flex-1 min-h-0 flex ${inSteps ? 'max-sm:flex-none max-sm:block' : ''}`}>
          <div ref={bodyRef} className={`flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 ${inSteps ? 'bg-slate-50/70 dark:bg-slate-950/30 max-sm:overflow-visible' : ''}`}>
            {alerts.length > 0 && (
              <div className="mb-4 space-y-2">
                {alerts.map((al) => (
                  <p key={al.text} role={al.tone === 'info' ? 'status' : 'alert'} className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm ${ALERT_TONE[al.tone]}`}>
                    <span className="flex items-start gap-2 min-w-0">
                      {al.tone === 'info' ? <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />}
                      <span>{al.text}</span>
                    </span>
                    {al.onDismiss && (
                      <button type="button" onClick={al.onDismiss} aria-label="Dismiss" className="shrink-0 inline-flex items-center justify-center w-6 h-6 -mr-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10">
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </p>
                ))}
              </div>
            )}
            {off ? (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 py-10 px-4 text-center tf-card-desc">{off}</div>
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
                <div className="flex flex-col min-h-full">
                  <AssessmentPicker
                    assessments={jobPickList as AssessmentResponse[]}
                    selectedId={asPick?.id ?? null}
                    onSelect={(a) => setAsPick(a as AssessmentResponse | null)}
                    scrollContainerRef={bodyRef}
                  />
                </div>
              )
            ) : bulkJob ? (
              /* The send's live counts and per-candidate rows; the floating
                 widget keeps following it after this popup closes. */
              <BulkInviteProgressPanel jobId={bulkJob.job_id} initialJob={bulkJob} compact onJobChange={onBulkJobChange} />
            ) : !loaded ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
              </div>
            ) : current === 'version' ? (
              <div className="space-y-4">
                <div>
                  <h3 className={INTRO_H}>Choose the version to send</h3>
                  <p className={INTRO_P}>Candidates take the version you pick here. Only Active versions can be sent.</p>
                </div>
                <div className={`${BLOCK} space-y-4`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {!jdId && !selected ? (
                      <button type="button" onClick={backToList} className="inline-flex items-center gap-1 text-xs font-medium text-brand-blue hover:text-brand-blue-2 hover:underline underline-offset-2">
                        <ArrowLeft className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                        Choose a different {label.singular.toLowerCase()}
                      </button>
                    ) : <h4 className="tf-subsection-title">Select {label.singular.toLowerCase()} version</h4>}
                    {!error && <VersionUsage kind={kind} used={versions.length} />}
                  </div>
                  <VersionList
                    kind={kind}
                    versions={jobWideVersions ?? listedVersions(kind, versions)}
                    allVersions={versions}
                    spansJobVersions={!!jobWideVersions}
                    loading={loading && !loaded}
                    error={error}
                    onRetry={() => void reload()}
                    selectedId={versionId}
                    onSelect={pickVersion}
                    createBlocked={blocked}
                    creating={creating}
                    onCreate={handleCreate}
                    perms={perms}
                    busyId={busyId}
                    onAction={handleAction}
                    hideDuplicate={hideDuplicate}
                  />
                </div>
              </div>
            ) : current === 'candidates' ? null : current === 'review' && !perms.canInvite ? (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 py-10 px-4 text-center tf-card-desc">{deniedTitle}</div>
            ) : current === 'review' && reviewRequest ? (
              <div className="space-y-4">
                <div>
                  <h3 className={INTRO_H}>Review candidates</h3>
                  <p className={INTRO_P}>Everyone ticked here gets the invite. Untick anyone you want to leave out. Nothing is sent until step {steps.length}.</p>
                </div>
                {noEmailCount > 0 && (
                  <p role="note" className="flex items-start gap-1.5 rounded-lg bg-warning-subtle border border-warning-line px-3 py-2 text-xs text-warning-strong">
                    <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
                    <span>{plural(noEmailCount, 'candidate')} from the page {noEmailCount === 1 ? 'has' : 'have'} no email address and won’t be invited.</span>
                  </p>
                )}
                <InviteReviewStep
                  jdId={selected?.jdId || job.jdId}
                  kind={kind}
                  request={reviewRequest}
                  leftOut={leftOut}
                  onLeftOut={setLeftOut}
                  onCounts={setReviewCounts}
                  onAddCandidates={() => goTo('candidates')}
                  onOverlayChange={onOverlayChange}
                />
              </div>
            ) : current === 'send' ? (
              <div className="space-y-4">
                <div>
                  <h3 className={INTRO_H}>Check the message and send</h3>
                  <p className={INTRO_P}>This is the email each candidate receives with their personal link.</p>
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { term: label.singular, value: pickedName, bad: false },
                    {
                      term: 'Will be invited',
                      value: reviewCounts
                        ? `${reviewCounts.invite.toLocaleString()}${reviewCounts.skipped ? ` (${reviewCounts.skipped.toLocaleString()} skipped)` : ''}`
                        : recipientCount.toLocaleString(),
                      bad: false,
                    },
                    {
                      term: 'Units after send',
                      value: quotaUnlimited ? 'Unlimited' : unitsAfter !== null ? Math.max(0, unitsAfter).toLocaleString() : '—',
                      bad: unitsAfter !== null && unitsAfter < 0,
                    },
                  ].map((d) => (
                    <div key={d.term} className="min-w-0 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5">
                      <dt className="text-xs text-gray-500 dark:text-slate-400">{d.term}</dt>
                      <dd className={`mt-0.5 truncate text-[0.9375rem] font-semibold tabular-nums ${d.bad ? 'text-destructive' : 'text-gray-900 dark:text-slate-50'}`} title={d.value}>{d.value}</dd>
                    </div>
                  ))}
                </dl>
                <div className={BLOCK}>
                  <InviteMessageStep
                    kind={kind}
                    message={message}
                    onMessage={(m) => { messageTouched.current = true; setMessage(m); }}
                    template={template}
                    expiryDays={expiryDays}
                    onExpiry={setExpiryDays}
                  />
                </div>
              </div>
            ) : null}
            {/* The candidates step stays mounted once opened (hidden on the
                other steps), so what was typed in, uploaded, filtered or
                opened is still there after Review → Back. */}
            {!off && job && !bulkJob && loaded && candidatesMounted && (
              <div className={current === 'candidates' ? 'space-y-4' : 'hidden'}>
                {recipients.length > 0 && (
                  <p className="rounded-lg border border-brand-blue/15 bg-brand-blue/[0.04] px-3 py-2 tf-body">
                    {plural(recipients.length, 'candidate')} from the page {recipients.length === 1 ? 'is' : 'are'} already included.
                  </p>
                )}
                <div>
                  <h3 className={INTRO_H}>Who do you want to invite?</h3>
                  <p className={INTRO_P}>
                    Add people, or pick from{' '}
                    <span className="font-medium text-brand-blue">{[job.jdCode, jobName].filter(Boolean).join(' · ')}</span> and your resume database.
                    Everyone you add stays selected across tabs.
                  </p>
                </div>
                <ServerCandidatePicker
                  jdId={job.jdId}
                  kind={kind}
                  versionId={selected?.sendable ? selected.id : null}
                  selection={serverSelection}
                  onSelectionChange={setServerSelection}
                  pickingDisabled={pickingOff}
                  onOverlayChange={onOverlayChange}
                  addTab={addTab}
                  onAddTabChange={setAddTab}
                  addCounts={extraCounts}
                  room={unitsRoom}
                  addedEmails={addedEmails}
                  addPanel={(
                    <ExtraCandidatesInput
                      key={extrasKey}
                      mode={addTab ?? 'manual'}
                      room={unitsRoom}
                      onChange={setExtras}
                      onCounts={setExtraCounts}
                      disabled={pickingOff}
                      onCopyLink={copyLinkFor}
                      takenEmail={takenEmail}
                      maxRows={extraMaxRows}
                      limitByUnits={extraLimitByUnits}
                    />
                  )}
                  footer={(
                    /* Stays in view while the list scrolls (wide screens; on
                       phones the popup's own footer carries the count). */
                    <div className="sm:sticky sm:-bottom-6 z-[2] flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-b-xl border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 sm:px-4 py-2.5 text-sm">
                      {addedCount > 0 ? (
                        <span className="min-w-0">
                          <b className="font-semibold text-brand-blue tabular-nums">✓ {addedCount.toLocaleString()} selected</b>
                          <span className="text-gray-500 dark:text-slate-400 tabular-nums">
                            {[
                              extraCounts.manual && `${extraCounts.manual.toLocaleString()} typed in`,
                              extraCounts.excel && `${extraCounts.excel.toLocaleString()} from Excel`,
                              selectionCount(serverSelection) && `${selectionCount(serverSelection).toLocaleString()} picked`,
                            ].filter(Boolean).map((part) => ` · ${part}`).join('')}
                          </span>
                        </span>
                      ) : (
                        <span className="text-gray-500 dark:text-slate-400">No one selected yet — add or pick candidates above.</span>
                      )}
                      <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        {quotaAvailable !== null && (
                          <span
                            className="inline-flex items-center gap-2 text-xs tabular-nums"
                            title={unitsRoom !== null && unitsRoom > 0 ? `${plural(unitsRoom, 'unit')} left` : undefined}
                          >
                            <span
                              aria-hidden="true"
                              className="relative h-1.5 w-20 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700"
                            >
                              <span
                                className={`absolute inset-y-0 left-0 rounded-full ${unitsTone.bar}`}
                                style={{ width: `${quotaAvailable > 0 ? Math.min(100, (recipientCount / quotaAvailable) * 100) : 100}%` }}
                              />
                            </span>
                            <span className={unitsTone.text}>
                              {recipientCount.toLocaleString()} / {quotaAvailable.toLocaleString()} units
                              {unitsRoom !== null && unitsRoom === 0 ? ' · Full' : unitsRoom !== null && unitsRoom < 0 ? ` · ${(-unitsRoom).toLocaleString()} over` : ''}
                            </span>
                          </span>
                        )}
                        {addedCount > 0 && (
                          <button
                            type="button"
                            onClick={clearCandidates}
                            className="text-xs font-medium text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 hover:underline underline-offset-2"
                          >
                            Clear selection
                          </button>
                        )}
                      </span>
                    </div>
                  )}
                />
              </div>
            )}
          </div>

          </div>

          <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 shrink-0 ${inSteps ? 'max-sm:sticky max-sm:bottom-0 max-sm:z-10' : ''}`}>
            <p className="min-w-0 sm:truncate tf-body">{footerText}</p>
            {/* Back / Cancel is as wide as its word; the main action takes the rest on phones. */}
            <div className="flex items-center justify-end gap-2 sm:gap-3 w-full sm:w-auto">
              {bulkJob ? (
                <button
                  onClick={onClose}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-colors shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
                >
                  Done
                </button>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => (inSteps && stepIndex > 0 ? goTo(steps[stepIndex - 1]) : requestClose())}
                    className="!h-9 shrink-0 px-4"
                  >
                    {inSteps && stepIndex > 0 ? 'Back' : 'Cancel'}
                  </Button>
                  {!job && !off ? (
                    <button
                      onClick={chooseFromList}
                      disabled={!listPicked}
                      className="flex-1 sm:flex-none min-w-0 flex items-center justify-center gap-2 px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-colors shadow-md shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Continue
                    </button>
                  ) : (
                    <button
                      onClick={onPrimary}
                      disabled={!inSteps || (nextDisabled && !(current === 'send' && !perms.canInvite))}
                      aria-disabled={!inSteps || nextDisabled}
                      aria-label={primaryLabel}
                      title={current === 'send' ? deniedTitle : undefined}
                      className={`flex-1 sm:flex-none min-w-0 flex items-center justify-center gap-2 px-4 py-2 text-sm whitespace-nowrap bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-colors shadow-md shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed ${nextDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : current === 'send' ? <Mail className="w-4 h-4" /> : null}
                      {/* Phones: "Next:" gives way so the label fits. */}
                      {primaryLabel.startsWith('Next: ') ? <span className="truncate"><span className="max-sm:hidden">Next: </span>{primaryLabel.slice(6)}</span> : primaryLabel}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {confirm && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-[1px] p-4 sm:p-6">
              <div role="alertdialog" aria-modal="true" aria-labelledby="version-invite-confirm" className="w-full max-w-md rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-4 sm:p-5">
                <h3 id="version-invite-confirm" className="tf-card-title">{confirm.title}</h3>
                <p className="mt-1.5 tf-card-desc">{confirm.message}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setConfirm(null)} disabled={confirmBusy} className="w-full">{confirm.cancelText ?? 'Cancel'}</Button>
                  <Button
                    variant={confirm.destructive ? 'destructive' : 'primary'}
                    size="sm"
                    onClick={() => void runConfirm()}
                    disabled={confirmBusy}
                    icon={confirmBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}
                    className="w-full"
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
