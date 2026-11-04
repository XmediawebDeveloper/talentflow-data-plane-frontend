'use client';

import { Fragment, useEffect, useEffectEvent, useId, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, Check, ClipboardList, Info, Lightbulb, Loader2, Mail, Trash2, Video, X } from 'lucide-react';
import { toast } from 'sonner';
import { usePathname, useRouter } from 'next/navigation';
import { saveInviteUnitsHandoff, USAGE_QUOTAS_FROM_INVITE_URL, type InviteUnitsRestore } from '@/lib/utils/inviteUnitsHandoff';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/hooks/useAuth';
import api from '@/lib/services/api';
import VersionList, { STATUS_PILL, VersionTitle, VersionUsage } from './VersionList';
import ServerCandidatePicker, { EMPTY_SELECTION, TAB_LABEL, selectionCount, toRequestSelection, type PickReveal, type PickerSelection } from './ServerCandidatePicker';
import ExtraCandidatesInput, { MAX_EXTRA_CANDIDATES, type EmailCheck, type ExistingCandidateMatch, type ExtraCounts, type ExtraMode, type PickedPerson } from './ExtraCandidatesInput';
import InviteQuotaBar, { isUnlimitedQuota } from './InviteQuotaBar';
import InviteReviewStep, { type LeftOut, type ReviewCounts } from './InviteReviewStep';
import InviteMessageStep from './InviteMessageStep';
import { DEFAULT_EXPIRY_DAYS, defaultInviteMessage } from './inviteDefaults';
import BulkInviteProgressPanel from '@/components/bulk-invite/BulkInviteProgressPanel';
import { bulkInviteService, SERVER_MATCH_LABEL, type BulkInviteJob, type BulkExtraCandidate, type BulkInviteSelection, type InviteCandidateSourceTab, type ServerInviteCandidate } from '@/lib/services/bulkInviteService';
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
  /** Closing with candidates picked: drawn as the discard warning (trash
   *  icon, the count in red, a warning strip), `count` candidates. */
  discard?: { count: number };
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
  send: 'Send invite',
};
const stepLabel = (s: Step, singular: string) => (s === 'version' ? singular : STEP_LABEL[s]);

/* The page's sections: an intro over each step, a white block. */
const INTRO_H = 'text-base font-semibold text-gray-900 dark:text-slate-50';
const INTRO_P = 'mt-1 text-sm text-gray-600 dark:text-slate-400';
const BLOCK = 'tf-panel p-4';

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
  pickInto,
  openOn,
  restore,
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
  /** Opened from the Resume Database's My Resumes / Shared Database table:
   *  the page's ticked resumes are picked in that list (shown ticked there,
   *  not sent as page candidates) and the Resume Database tab opens on it. */
  pickInto?: 'my-resumes' | 'internal-db';
  /** Opened from the AI Talent Match / Score Resume page: that list's tab
   *  opens first (the page's candidates are still sent as they are). */
  openOn?: 'talent-match' | 'score-resume';
  /** Back from Usage & Quotas (Add units): how far the popup had got — the
   *  version, the picks, the rows added, the tab — put back as it was. */
  restore?: InviteUnitsRestore;
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
  const [versionId, setVersionId] = useState<string | null>(restore?.versionId ?? null);
  const [step, setStep] = useState<Step | null>(null);
  /* The page's candidates with an email go straight into the send (no email,
     no invite — said once in Review). `preselect` false lists them left out.
     With `pickInto` they are the list's own picks instead (`pagePicks`) —
     and so from AI Talent Match for one job: ticked in its AI Talent Match
     tab (a pick with no resume id stays a page candidate). */
  const listPicks: InviteCandidateSourceTab | undefined = pickInto ?? (openOn === 'talent-match' && jdId ? 'talent-match' : undefined);
  const recipients = pickInto ? []
    : listPicks ? candidates.filter((c) => c.email && !c.resumeId)
    : candidates.filter((c) => c.email);
  const [pagePicks] = useState<PickerSelection>(() => (listPicks
    ? {
        mode: 'ids',
        picked: Object.fromEntries(candidates
          .filter((c) => c.email && c.resumeId)
          .map((c) => [c.resumeId!, { resumeId: c.resumeId!, name: c.name, email: c.email, source: listPicks }])),
      }
    : EMPTY_SELECTION));
  const noEmailCount = candidates.filter((c) => !c.email).length;
  const [leftOut, setLeftOut] = useState<LeftOut>(() => (
    preselect ? {} : Object.fromEntries(recipients.map((c) => [reviewKey({ resume_id: c.resumeId, email: c.email }), 'extra' as const]))
  ));
  const [reviewCounts, setReviewCounts] = useState<ReviewCounts | null>(null);
  const [message, setMessage] = useState(restore?.message ?? '');
  const messageTouched = useRef(restore?.message !== undefined);
  const [expiryDays, setExpiryDays] = useState(restore?.expiryDays ?? DEFAULT_EXPIRY_DAYS);
  const [quotaAvailable, setQuotaAvailable] = useState<number | null>(null);
  const [quotaUnlimited, setQuotaUnlimited] = useState(false);
  /* Pick from lists: the picked rows or the filter — never the rows themselves. */
  const [serverSelection, setServerSelection] = useState<PickerSelection>(restore?.selection ?? pagePicks);
  /* Added by email (typed / Excel). */
  const [extras, setExtras] = useState<BulkExtraCandidate[]>(restore?.extras ?? []);
  const [extraCounts, setExtraCounts] = useState<ExtraCounts>(() => {
    const excel = (restore?.extras ?? []).filter((x) => x.invite_source === 'Excel upload').length;
    return { manual: (restore?.extras?.length ?? 0) - excel, excel };
  });
  /* The candidates step's open tab when it is Manual / Upload Excel (null =
     one of the lists), and a key that empties what was added directly.
     Opens on Manual — or, opened from a list's own page (My Resumes, Shared
     Database, AI Talent Match, Score Resume), on that list. */
  const openTab: ExtraMode | null = pickInto || openOn ? null : 'manual';
  const [addTab, setAddTab] = useState<ExtraMode | null>(restore ? restore.addTab : openTab);
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
  /* Closing this popup hands a still-running send to the floating card; a
     send that already finished here is just dropped (its result was seen). */
  const bulkJobId = bulkJob?.job_id;
  const setBulkInPopup = bulkTracker?.setInPopup;
  useEffect(() => {
    if (!bulkJobId || !setBulkInPopup) return;
    setBulkInPopup(bulkJobId, true);
    return () => setBulkInPopup(bulkJobId, false);
  }, [bulkJobId, setBulkInPopup]);
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
  /* Set by a pick from the job-less list: the steps then open on step 1. */
  const fromListPick = useRef(false);
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
      // version → Candidates; else the Version step. Picked from the list
      // (Resume Database and the other job-less buttons): step 1, Add
      // candidates — the page's candidates are already in, so it skipped
      // straight to Review. From AI Talent Match the page's picks open on
      // Candidates instead (step 2): seen with the rest of the list first.
      // Back from Add units: the step it was on, while its version still sends.
      const restored = restore?.versionId ? pool.find((v) => v.id === restore.versionId && v.sendable) : undefined;
      setStep(restore ? (restored ? restore.step : 'version')
        : !chosen ? 'version'
        : fromListPick.current ? (fixed ? 'candidates' : 'version')
        : openOn === 'talent-match' && (recipients.length > 0 || selectionCount(pagePicks) > 0) ? 'candidates'
        : recipients.length > 0 ? 'review'
        : fixed ? 'candidates' : 'version');
      fromListPick.current = false;
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
  /* No units left at all: picking is greyed out, and Next is held from the
     candidates step on (the Version step stays open to look at). */
  const noUnits = quotaAvailable !== null && quotaAvailable <= 0;
  const unitsNoun = kind === 'interview' ? 'AI interview' : 'Assessment';
  /* How many typed-in / Excel rows fit: the units available (or the backend's
     per-send cap on unlimited plans), less everyone already picked elsewhere. */
  const extraLimitByUnits = !quotaUnlimited && quotaAvailable !== null && quotaAvailable < MAX_EXTRA_CANDIDATES;
  const extraMaxRows = Math.max(
    0,
    (extraLimitByUnits ? quotaAvailable! : MAX_EXTRA_CANDIDATES) - recipients.length - selectionCount(serverSelection),
  );
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
    cancelText: 'Cancel',
    destructive: true,
    discard: { count: addedCount },
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
    fromListPick.current = true;
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
    // The page's own picks come back with the next pick from the list.
    setServerSelection(pagePicks);
    setCandidatesMounted(false);
    setAddTab(openTab);
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

  /* Everyone picked outside Manual / Upload Excel — the Manual tab says a
     typed email among them is already included, and asks about a typed name
     among them (same person, another email?). */
  const pickedPeople: PickedPerson[] = [
    ...recipients.map((c) => ({ name: c.name, email: c.email, sourceLabel: 'this page' })),
    ...(serverSelection.mode === 'ids'
      ? Object.values(serverSelection.picked).map((x) => ({
          name: x.name, email: x.email, sourceLabel: TAB_LABEL[x.source], sourceKey: x.source, resumeId: x.resumeId,
        }))
      : []),
  ];
  /* Manual's View: the pick shown in its own tab. */
  const revealPick = useRef<((r: PickReveal) => void) | null>(null);
  const viewPicked = (p: PickedPerson) => {
    if (!p.resumeId || !p.sourceKey) return;
    revealPick.current?.({ source: p.sourceKey as InviteCandidateSourceTab, resumeId: p.resumeId, email: p.email });
  };

  /* Add units: the popup saved as it is, then Usage & Quotas; buying and
     coming back reopens it here. Without access to Usage & Quotas, who to
     ask instead. */
  const router = useRouter();
  const canAddUnits = can('canViewUsage');
  const addUnits = () => {
    saveInviteUnitsHandoff({
      request: {
        kind,
        job: job ? { jdId: job.jdId, jdCode: job.jdCode, jdTitle: job.jdTitle, versionNumber: job.jobVersionNumber } : undefined,
        versionId: fixedVersionId,
        candidates,
        preselect,
        pickInto,
        openOn,
        hideDuplicate,
        inviteGate: { allowed: inviteAllowed, reason: inviteDeniedReason },
      },
      restore: {
        step: current === 'version' ? 'version' : 'candidates',
        versionId,
        selection: serverSelection,
        extras,
        addTab,
        ...(messageTouched.current ? { message, expiryDays } : {}),
      },
      noun: unitsNoun,
      candidateCount: recipientCount,
    });
    // The popup's own history entry is swapped for Usage & Quotas (replace),
    // so Back from there lands on this page — not taken off with history.back().
    guard.current.active = false;
    onClose();
    router.replace(USAGE_QUOTAS_FROM_INVITE_URL);
  };
  const addUnitsAction: ReactNode = canAddUnits ? (
    <Button variant="primary" size="sm" onClick={addUnits} className="shrink-0 whitespace-nowrap">
      Add units
    </Button>
  ) : (
    <span className="block text-xs font-medium">Contact your workspace admin to add units.</span>
  );

  /* An email typed in that is already picked elsewhere — said at once. */
  const takenEmail = (email: string): string | null => {
    if (recipients.some((c) => c.email.trim().toLowerCase() === email)) return 'this page';
    if (serverSelection.mode === 'ids') {
      const hit = Object.values(serverSelection.picked).find((x) => x.email.trim().toLowerCase() === email);
      if (hit) return TAB_LABEL[hit.source];
    }
    return null;
  };

  /* A typed email, looked up on the server before it is added (Manual tab):
     - already sent to by a "Select all matching" selection → cannot be added
       again (it would be invited twice);
     - a candidate in one of the lists but not picked → offered as "Use that
       resume", so the invite is linked to it instead of a bare email.
     Lists the user cannot open answer with an error and are skipped. */
  const LOOKUP_SOURCES: InviteCandidateSourceTab[] = ['talent-match', 'score-resume', 'my-resumes', 'internal-db'];
  const sameEmail = (r: ServerInviteCandidate, email: string) => r.email.trim().toLowerCase() === email;
  /* A filter selection with its own search keeps only rows matching it. */
  const inFilterSearch = (r: ServerInviteCandidate, q?: string) => {
    if (!q) return true;
    const t = q.toLowerCase();
    return [r.name, r.email, r.title ?? ''].some((v) => v.toLowerCase().includes(t));
  };
  const lookupParams = () => ({ kind, version_id: selected?.sendable ? selected.id : null, page: 1, page_size: 10 });
  /* Already invited to the version being sent? The Review step's own check
     (POST …/bulk-invites/review) for this one email, so the answer is the
     one Send would act on — said when it is typed, not found at Review. */
  const invitedCheck = async (email: string): Promise<string | null> => {
    if (!job || !selected?.sendable) return null;
    const res = await bulkInviteService.review(selected.jdId || job.jdId, {
      kind,
      version_id: selected.id,
      selection: { mode: 'ids', resume_ids: [] },
      // Any valid name: only the email decides "already invited".
      extra_candidates: [{ name: 'Candidate', email }],
      view: 'skipped',
      page: 1,
      page_size: 5,
    });
    const row = res.items.find((r) => r.email.trim().toLowerCase() === email && /invited/i.test(r.reason ?? ''));
    return row
      ? `${email} is already invited to ${label.singular} v${selected.version}, so it would be skipped. To send it again, use Resend in Track Invites.`
      : null;
  };
  const checkEmail = async (email: string): Promise<EmailCheck> => {
    if (!job) return {};
    // Runs beside the list look-ups below; a failure leaves it to Review.
    const invited = invitedCheck(email).catch(() => null);
    const sel = serverSelection;
    if (sel.mode === 'filter') {
      const res = await bulkInviteService.listCandidates(job.jdId, { ...lookupParams(), ...sel.filters, source: sel.source, search: email });
      const hit = res.items.find((r) => sameEmail(r, email) && !sel.excluded[r.resume_id] && inFilterSearch(r, sel.filters.search));
      if (hit) return { taken: `${TAB_LABEL[sel.source]} (Select all matching)` };
    }
    const invitedMessage = await invited;
    if (invitedMessage) return { invited: invitedMessage };
    const found = await Promise.allSettled(LOOKUP_SOURCES.map((source) =>
      bulkInviteService.listCandidates(job.jdId, { ...lookupParams(), source, search: email })));
    for (let i = 0; i < LOOKUP_SOURCES.length; i += 1) {
      const res = found[i];
      if (res.status !== 'fulfilled') continue;
      const hit = res.value.items.find((r) => sameEmail(r, email));
      if (!hit) continue;
      const detail = hit.score
        ? `${hit.score.percent}% · ${SERVER_MATCH_LABEL[hit.score.match_status]}`
        : hit.rating ? `rating ${hit.rating}` : undefined;
      return {
        match: {
          resumeId: hit.resume_id,
          name: hit.name,
          email: hit.email.trim().toLowerCase(),
          sourceLabel: TAB_LABEL[LOOKUP_SOURCES[i]],
          sourceKey: LOOKUP_SOURCES[i],
          detail,
        },
      };
    }
    return {};
  };
  /* A sheet's emails against a "Select all matching" selection: its rows
     read whole (page 1, the rest in parallel) once per selection. Past 2,000
     rows it is left to the Review step's own check. */
  const selectionEmailsCache = useRef<{ key: string; emails: Promise<Set<string>> } | null>(null);
  const checkEmails = async (emails: string[]): Promise<Set<string>> => {
    const sel = serverSelection;
    if (!job || sel.mode !== 'filter' || sel.total > 2000) return new Set();
    const key = JSON.stringify({ jd: job.jdId, v: selected?.id, source: sel.source, filters: sel.filters, out: Object.keys(sel.excluded) });
    if (selectionEmailsCache.current?.key !== key) {
      const load = async () => {
        const SIZE = 50;
        const params = { ...lookupParams(), ...sel.filters, source: sel.source, page_size: SIZE };
        const first = await bulkInviteService.listCandidates(job.jdId, { ...params, page: 1 });
        const pages = Math.ceil(first.total / SIZE);
        const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, i) =>
          bulkInviteService.listCandidates(job.jdId, { ...params, page: i + 2 })));
        return new Set([first, ...rest].flatMap((p) => p.items)
          .filter((r) => !sel.excluded[r.resume_id])
          .map((r) => r.email.trim().toLowerCase()));
      };
      selectionEmailsCache.current = { key, emails: load() };
    }
    const inSelection = await selectionEmailsCache.current.emails;
    return new Set(emails.filter((e) => inSelection.has(e)));
  };
  /* "Use that resume": picked in its own list (ticked there, counted on that
     tab). A "Select all matching" selection cannot take a single pick from
     another list, so then the Manual tab adds it linked to the resume. */
  const useExistingCandidate = (match: ExistingCandidateMatch): boolean => {
    if (serverSelection.mode !== 'ids') return false;
    setServerSelection({
      mode: 'ids',
      picked: {
        ...serverSelection.picked,
        [match.resumeId]: { resumeId: match.resumeId, name: match.name, email: match.email, source: match.sourceKey as InviteCandidateSourceTab },
      },
    });
    return true;
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
      // Mark it as on screen first, so the floating card never flashes up
      // while this popup is showing the run.
      bulkTracker?.setInPopup(started.job_id, true);
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

  /* Opened from the Resume Database with resumes ticked there: why fewer than
     that many are selected or will be sent — no email (never ticked), or
     already invited to this version (ticked, skipped at send) — read from the
     same review the Review step uses, per version. Said in the candidates
     footer, so a first-time user sees why 62 became 61. */
  const pagePickIds = Object.keys(pagePicks.mode === 'ids' ? pagePicks.picked : {});
  const pageCheckKey = listPicks && job && sendableId && pagePickIds.length ? `${sendableId}` : null;
  const [pageCheck, setPageCheck] = useState<{ key: string; invited: number; other: number } | null>(null);
  useEffect(() => {
    if (!pageCheckKey || !job || !selected) return;
    let cancelled = false;
    bulkInviteService.review(selected.jdId || job.jdId, {
      kind,
      version_id: pageCheckKey,
      selection: { mode: 'ids', resume_ids: pagePickIds },
      view: 'skipped',
      page: 1,
      page_size: 100,
    })
      .then((res) => {
        if (cancelled) return;
        const invited = res.items.filter((r) => /invited/i.test(r.reason ?? '')).length;
        // Past the first 100 skipped rows the reasons are not read; they count as "other".
        setPageCheck({ key: pageCheckKey, invited, other: Math.max(0, res.counts.skipped - invited) });
      })
      .catch(() => { /* the tip simply leaves the server's part out */ });
    return () => { cancelled = true; };
    // pageCheckKey stands for the version; the page's picks never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageCheckKey]);
  const pageCheckNow = pageCheck && pageCheck.key === pageCheckKey ? pageCheck : null;
  const pageTip = (() => {
    if (!listPicks || candidates.length === 0) return null;
    const parts: string[] = [];
    if (noEmailCount > 0) parts.push(`${noEmailCount.toLocaleString()} without email`);
    if (pageCheckNow?.invited) parts.push(`${pageCheckNow.invited.toLocaleString()} already invited to ${versionTag}`);
    if (pageCheckNow?.other) parts.push(`${pageCheckNow.other.toLocaleString()} skipped for another reason`);
    if (parts.length === 0) return null;
    const ready = Math.max(0, candidates.length - noEmailCount - (pageCheckNow?.invited ?? 0) - (pageCheckNow?.other ?? 0));
    return `${ready.toLocaleString()} of ${candidates.length.toLocaleString()} picked will get the invite · ${parts.join(' · ')}`;
  })();
  const selectedNow = reviewCounts ? reviewCounts.all - reviewCounts.left_out : recipientCount;
  const totalNow = reviewCounts ? reviewCounts.all : recipientCount;

  /* The footer's one line: what holds the next step, else where things stand. */
  const footerText = off
    ? ''
    : !job
      // The list's pick named, once there is one: Continue is the next move.
      ? ((kind === 'assessment' ? asPick : aiPick) ? `${label.singular} picked — press Continue` : `Select ${article} to continue`)
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
              : noUnits
                ? 'No units left — add units to continue.'
              : current === 'candidates' && recipientCount === 0
                ? 'Add at least one candidate to continue'
                : current === 'review' && reviewCounts && selectedNow === 0
                  ? 'Select at least one candidate to continue'
                  : (current === 'review' || current === 'send') && quotaShort
                    ? `Deselect ${shortBy.toLocaleString()} ${shortBy === 1 ? 'candidate' : 'candidates'} or add units to continue`
                    : current === 'send' && emptyMessage
                      ? 'Write a message to continue'
                      // Opened from the Resume Database: why not all of the page's picks
                      // get the invite, in place of the count.
                      : pageTip ?? `${selectedNow.toLocaleString()} of ${totalNow.toLocaleString()} selected · ${versionTag}`;

  /* What each step needs before the next one opens. */
  const stepReady = (s: Step): boolean => s === 'version'
    ? !!selected?.sendable
    : s === 'candidates'
      ? recipientCount > 0 && !pickingOff && !noUnits
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
        ? 'Next: Send invite'
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
  const alerts: { tone: 'warn' | 'info' | 'danger'; text: string; onDismiss?: () => void; action?: ReactNode }[] = [];
  if (inSteps && deniedTitle) {
    alerts.push({ tone: 'warn', text: !inviteAllowed && inviteDeniedReason ? inviteDeniedReason : `Sending invites needs the Invite permission for ${label.plural}. Ask a workspace admin.` });
  }
  if (inSteps && verNote) alerts.push({ tone: 'info', text: verNote, onDismiss: () => setVerNote(null) });
  if (inSteps && noUnits && current === 'version') {
    alerts.push({ tone: 'danger', text: `No ${unitsNoun} units left. You can view versions, but invites can't be sent until units are added.`, action: addUnitsAction });
  }
  if (inSteps && quotaShort && current !== 'version' && noUnits) {
    // Nothing to deselect towards: the picks are kept for when units are added.
    alerts.push({ tone: 'danger', text: `${plural(willInvite, 'candidate')} ${willInvite === 1 ? 'is' : 'are'} selected, but no ${unitsNoun} units are left. Add units to send, or close and come back later.`, action: addUnitsAction });
  } else if (inSteps && quotaShort && current !== 'version') {
    alerts.push({ tone: 'danger', text: `Only ${plural(quotaAvailable ?? 0, 'unit')} ${quotaAvailable === 1 ? 'is' : 'are'} available for ${plural(willInvite, 'candidate')}. Deselect ${shortBy.toLocaleString()} to continue, or add units.` });
  }
  // No units at all is said on the lists themselves (greyed, with the reason).
  if (inSteps && current === 'candidates' && !quotaShort && unitsRoom === 0 && !noUnits) {
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
                <h2 id="version-invite-title" className="tf-section-title sm:text-lg tracking-tight">
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
                {/* Below laptop width only the current step names itself — four
                    labels overran a tablet-width popup and were cut off. */}
                <ol className="flex min-w-max lg:min-w-0 items-center gap-1.5 sm:gap-2">
                  {steps.map((s, i) => {
                    const done = i < stepIndex;
                    const here = i === stepIndex;
                    const open = !here && reachable(i);
                    return (
                      <Fragment key={s}>
                        {i > 0 && <li aria-hidden="true" className={`h-px flex-1 min-w-4 sm:min-w-6 ${done || here ? 'bg-brand-blue/40' : 'bg-gray-200 dark:bg-slate-700'}`} />}
                        <li>
                          <button
                            type="button"
                            onClick={() => { if (open) goTo(s); }}
                            disabled={!open}
                            aria-current={here ? 'step' : undefined}
                            title={stepLabel(s, label.singular)}
                            className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-sm whitespace-nowrap disabled:cursor-default ${
                              here ? 'font-semibold text-gray-900 dark:text-slate-50' : open ? 'font-medium text-brand-blue hover:underline underline-offset-2' : 'font-medium text-gray-400 dark:text-slate-500'
                            }`}
                          >
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                              here || done ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400'
                            }`}>
                              {done ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : i + 1}
                            </span>
                            <span className={here ? '' : 'max-lg:hidden'}>{stepLabel(s, label.singular)}</span>
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
                  <div key={al.text} role={al.tone === 'info' ? 'status' : 'alert'} className={`flex flex-wrap items-start justify-between gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5 text-sm ${ALERT_TONE[al.tone]}`}>
                    <span className="flex items-start gap-2 min-w-0 flex-1 basis-60">
                      {al.tone === 'info' ? <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />}
                      <span>{al.text}</span>
                    </span>
                    {al.action && <span className="pl-6 sm:pl-0">{al.action}</span>}
                    {al.onDismiss && (
                      <button type="button" onClick={al.onDismiss} aria-label="Dismiss" className="shrink-0 inline-flex items-center justify-center w-6 h-6 -mr-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10">
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {off ? (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 py-10 px-4 text-center tf-body-secondary">{off}</div>
            ) : !job ? (
              /* No job given: every published one, any job — the pick names
                 the job and the version. */
              jobPickList === null ? (
                <div className="flex items-center justify-center py-12 tf-loader-center tf-loader-center--compact">
                  <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
                </div>
              ) : kind === 'interview' ? (
                <div className="flex flex-col min-h-full">
                  <AIInterviewPicker
                    configs={jobPickList as AIInterviewResponse[]}
                    selection={aiPick}
                    onSelectionChange={setAiPick}
                    scrollContainerRef={bodyRef}
                  />
                </div>
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
                    ) : <h4 className="tf-row-title">Select {label.singular.toLowerCase()} version</h4>}
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
                <dl className="tf-grid-3">
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
                    <div key={d.term} className="min-w-0 tf-panel px-3 py-2.5">
                      <dt className="tf-meta">{d.term}</dt>
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
                  initialSource={pickInto ?? openOn}
                  selectedTotal={addedCount}
                  onClearSelection={clearCandidates}
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
                  revealRef={revealPick}
                  noUnitsNoun={noUnits ? unitsNoun : null}
                  noUnitsAction={addUnitsAction}
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
                      checkEmail={checkEmail}
                      checkEmails={checkEmails}
                      onUseExisting={useExistingCandidate}
                      picked={pickedPeople}
                      onViewPicked={viewPicked}
                      noUnitsNoun={noUnits ? unitsNoun : null}
                      noUnitsAction={addUnitsAction}
                      initialRows={restore?.extras}
                      maxRows={extraMaxRows}
                      limitByUnits={extraLimitByUnits}
                    />
                  )}
                />
              </div>
            )}
          </div>

          </div>

          <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 shrink-0 ${inSteps ? 'max-sm:sticky max-sm:bottom-0 max-sm:z-10' : ''}`}>
            <p className="min-w-0 sm:truncate tf-body" title={footerText || undefined}>
              {footerText && footerText === pageTip && <Lightbulb className="inline w-4 h-4 mr-1.5 -mt-0.5 text-amber-500" aria-hidden="true" />}
              {footerText}
            </p>
            {/* Back / Cancel is as wide as its word; the main action takes the rest on phones. */}
            <div className="flex items-center justify-end gap-2 sm:gap-3 w-full sm:w-auto">
              {bulkJob ? (
                <button
                  onClick={onClose}
                  className="tf-btn tf-btn-primary w-full sm:w-auto flex px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 transition-colors shadow-md shadow-brand-blue/25 ring-1 ring-white/10 whitespace-normal font-normal"
                >
                  Done
                </button>
              ) : (
                <>
                  {/* Cancel on every step (it asks first when candidates are
                      picked); Back as well once past the first step. */}
                  <Button
                    variant="secondary"
                    onClick={requestClose}
                    className="!h-9 shrink-0 px-4"
                  >
                    Cancel
                  </Button>
                  {inSteps && stepIndex > 0 && (
                    <Button
                      variant="secondary"
                      onClick={() => goTo(steps[stepIndex - 1])}
                      className="!h-9 shrink-0 px-4"
                    >
                      Back
                    </Button>
                  )}
                  {!job && !off ? (
                    <button
                      onClick={chooseFromList}
                      disabled={!listPicked}
                      className="tf-btn tf-btn-primary flex-1 sm:flex-none min-w-0 flex px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 transition-colors shadow-md shadow-brand-blue/25 ring-1 ring-white/10 whitespace-normal font-normal"
                    >
                      Continue
                    </button>
                  ) : (
                    <button
                      onClick={onPrimary}
                      disabled={!inSteps || (nextDisabled && !(current === 'send' && !perms.canInvite))}
                      aria-disabled={!inSteps || nextDisabled}
                      aria-label={primaryLabel}
                      title={current !== 'version' && noUnits ? `No ${unitsNoun} units left.` : current === 'send' ? deniedTitle : undefined}
                      className={`flex-1 sm:flex-none min-w-0 flex items-center justify-center gap-2 px-4 py-2 text-sm whitespace-nowrap bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-colors shadow-md shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed ${nextDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : current === 'send' ? <Mail className="w-4 h-4" /> : null}
                      {/* Phones: "Next:" gives way so the label fits — except
                          before the send step, where "Send invite" alone would
                          read as sending now. */}
                      {primaryLabel.startsWith('Next: ') ? <span className="truncate"><span className={nextStep === 'send' ? '' : 'max-sm:hidden'}>Next: </span>{primaryLabel.slice(6)}</span> : primaryLabel}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {confirm && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-[1px] p-4 sm:p-6">
              {confirm.discard ? (
                /* Discard: no corner X — Cancel keeps editing, the red button
                   discards and closes. */
                <div role="alertdialog" aria-modal="true" aria-labelledby="version-invite-confirm" aria-describedby="version-invite-confirm-desc" className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-5 sm:p-6 text-left">
                  {/* Icon and title on one line. */}
                  <div className="flex items-center gap-3">
                    <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 dark:bg-red-500/10 ring-1 ring-red-100 dark:ring-red-500/20">
                      <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                    </span>
                    <h3 id="version-invite-confirm" className="min-w-0 text-lg sm:text-xl font-bold text-gray-900 dark:text-slate-50">
                      Discard <span className="text-red-600 dark:text-red-400 tabular-nums">{confirm.discard.count.toLocaleString()}</span> selected {confirm.discard.count === 1 ? 'candidate' : 'candidates'}?
                    </h3>
                  </div>
                  <p id="version-invite-confirm-desc" className="mt-3 text-sm text-gray-600 dark:text-slate-400">
                    Closing now will remove the {plural(confirm.discard.count, 'selected candidate')} from your list. This action <span className="font-semibold text-red-600 dark:text-red-400">cannot be undone</span>.
                  </p>
                  <div className="mt-4 flex items-center gap-3 rounded-xl border border-red-100 dark:border-red-500/20 bg-red-50/70 dark:bg-red-500/10 px-4 py-3 text-left">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
                    <span aria-hidden="true" className="h-6 w-px shrink-0 bg-red-200 dark:bg-red-500/30" />
                    <p className="text-sm font-medium text-gray-800 dark:text-slate-200">
                      You are about to discard <span className="font-bold text-red-600 dark:text-red-400 tabular-nums">{confirm.discard.count.toLocaleString()}</span> {confirm.discard.count === 1 ? 'candidate' : 'candidates'}.
                    </p>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <Button variant="secondary" onClick={() => setConfirm(null)} disabled={confirmBusy} className="w-full">
                      {confirm.cancelText ?? 'Cancel'}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => void runConfirm()}
                      disabled={confirmBusy}
                      icon={confirmBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      className="w-full"
                      autoFocus
                    >
                      {confirm.confirmText}
                    </Button>
                  </div>
                </div>
              ) : (
              <div role="alertdialog" aria-modal="true" aria-labelledby="version-invite-confirm" className="w-full max-w-md rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-4 sm:p-5">
                <h3 id="version-invite-confirm" className="tf-section-title">{confirm.title}</h3>
                <p className="mt-1.5 tf-body-secondary">{confirm.message}</p>
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
              )}
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
