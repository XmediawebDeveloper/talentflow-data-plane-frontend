'use client';

import { useEffect, useEffectEvent, useRef, useState, type ComponentProps } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle, ClipboardList, Link2, Loader2, Mail, Video } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import { Button } from '@/components/ui/button';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { useAuth } from '@/lib/hooks/useAuth';
import api from '@/lib/services/api';
import VersionList, { VersionUsage } from './VersionList';
import SendToPanel from './SendToPanel';
import ResultsStep from './ResultsStep';
import ServerCandidatePicker, { EMPTY_SELECTION, describeFilters, selectionCount, toRequestSelection, type PickerSelection } from './ServerCandidatePicker';
import ExtraCandidatesInput from './ExtraCandidatesInput';
import BulkInviteProgressPanel from '@/components/bulk-invite/BulkInviteProgressPanel';
import { bulkInviteService, type BulkInviteJob, type BulkExtraCandidate } from '@/lib/services/bulkInviteService';
import { useOptionalBulkInviteProgress } from '@/contexts/BulkInviteProgressContext';
import AssessmentPicker from '@/components/assessments/AssessmentPicker';
import AssessmentPreviewModal from '@/components/AssessmentPreviewModal';
import AssessmentConfigureModal from '@/components/AssessmentConfigureModal';
import AIInterviewPicker from '@/components/ai-interview/AIInterviewPicker';
import ConfigurePreviewDialog from '@/components/ai-interview/ConfigurePreviewDialog';
import AIInterviewWizardDialog from '@/components/ai-interview/AIInterviewWizardDialog';
import type { AIInterviewResponse } from '@/lib/services/aiInterviewService';
import type { AssessmentResponse } from '@/lib/services/assessmentService';
import ShareAssessmentModal from '@/components/ShareAssessmentModal';
import AIInterviewShareQueue from './AIInterviewShareQueue';
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
  sendVersion,
  versionHref,
  INVITE_SOURCE_BY_TAB,
  type DeliveryMethod,
  type InviteCandidate,
  type InviteKind,
  type InviteVersion,
  type SendResult,
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

/**
 * Job Details → AI Talent Match: "Create / Send Assessment" and "Create / Send
 * AI Interview" — two SEPARATE popups, this one component per `kind`. Built
 * on the Invite to Assessment / AI Interview popups' shell (InviteToAssessmentFlow,
 * class for class): the type's version cards (up to MAX_VERSIONS[kind] per
 * JD row, every status counted, the Latest Active one pre-ticked, one version
 * per send, New version = a Draft copy of the latest), the candidates and the
 * invitation, and one Send; the send's per-candidate results then replace
 * the body. Mounted only while open, so every opening starts fresh.
 */
export default function VersionInviteDialog({
  kind,
  onClose,
  jdId,
  jdCode,
  jdTitle,
  jobVersionNumber,
  candidates,
  disabledReason,
  onSent,
  onAssessmentsSent,
  onInterviewsSent,
  hideDuplicate = false,
  inviteAllowed = true,
  inviteDeniedReason,
  preselect = true,
  bulk = false,
}: {
  kind: InviteKind;
  onClose: () => void;
  jdId: string;
  jdCode?: string;
  jdTitle: string;
  jobVersionNumber?: number;
  /** The candidates ticked on the page. */
  candidates: InviteCandidate[];
  /** Why this type is off for the job (feature disabled, JD disabled), or null. */
  disabledReason?: string | null;
  /** Invitations went out — the host refreshes its counts. */
  onSent?: (kind: InviteKind, sentCount: number) => void;
  /** Assessment popup: Next moves to a second step IN this popup — Share
   *  Assessment via Email (embedded) with the picked assessment(s) and the
   *  ticked candidates; that step sends, Back returns here. Given it, the
   *  popup also offers "Browse all assessments instead" (the original
   *  cross-job list), whose Next does the same. Called with the number sent. */
  onAssessmentsSent?: (sentCount: number) => void;
  /** AI Interview popup, the same pattern: Next moves to Send AI Interview
   *  via Email IN this popup with the picked interview(s) — several (Browse
   *  all) go one after another — and the ticked candidates; that step sends,
   *  Back returns here. Called once when at least one invitation went out. */
  onInterviewsSent?: (sentCount: number) => void;
  /** Leave Duplicate out of the version cards' ⋯ menu. */
  hideDuplicate?: boolean;
  /** Host-specific invite gate (e.g. AI Talent Match's own "Invite to …"
   *  entry-point permission). Omitted = no extra gate (default behaviour). */
  inviteAllowed?: boolean;
  /** Shown when `inviteAllowed` is false. */
  inviteDeniedReason?: string;
  /** Tick every candidate on open (the page ticked them). False = list them
   *  unticked for the recruiter to pick (Job Details' Create / Send tiles). */
  preselect?: boolean;
  /** Job Details' Create / Send tiles: the candidates are the JOB's — its AI
   *  Talent Match and Scored Resume lists, read from the server a page at a
   *  time with search and filters (ServerCandidatePicker) — and Send starts
   *  a background job (POST /jd/{id}/bulk-invites) whose progress survives
   *  closing the popup. `candidates` is ignored. Pages that tick rows
   *  themselves keep the per-candidate flow (and its share step). */
  bulk?: boolean;
}) {
  const { user, isTenantAdmin } = useAuth();
  const p = (user?.permissions || {}) as Record<string, boolean | undefined>;
  const can = (key: string) => isTenantAdmin || !!p[key];
  const perms: VersionPermissions = kind === 'assessment'
    ? {
        canCreate: can('canCreateAssessments'),
        canUpdate: can('canUpdateAssessments'),
        canPublish: can('canUpdateAssessments') || can('canCreateAssessments'),
        // The Assessments page gates Archive / Unarchive on the delete permission.
        canArchive: can('canDeleteAssessments'),
        canInvite: can('canCreateAssessments'),
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

  const [versions, setVersions] = useState<InviteVersion[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(!off);
  const [error, setError] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [candidateIds, setCandidateIds] = useState<string[]>(() => (preselect ? candidates.filter((c) => c.email).map((c) => c.id) : []));
  const [method, setMethod] = useState<DeliveryMethod>('email');
  const [message, setMessage] = useState('');
  const [expiryDays, setExpiryDays] = useState(1);
  const [view, setView] = useState<'compose' | 'results' | 'progress'>('compose');
  const [results, setResults] = useState<SendResult[]>([]);
  const [sending, setSending] = useState(false);
  const [sendTotal, setSendTotal] = useState(0);
  /* `bulk`: the picked rows or the filter — never the rows themselves — and
     the background send once it has started. */
  const [serverSelection, setServerSelection] = useState<PickerSelection>(EMPTY_SELECTION);
  /* Bulk mode: candidates typed in or read from a sheet, on top of the picks. */
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
  /* A create / edit opened in another tab: re-read on coming back. */
  const reloadOnFocus = useRef(false);
  /* Browse all assessments: the original cross-job picker, loaded on first use. */
  const [browseAll, setBrowseAll] = useState(false);
  const [browseList, setBrowseList] = useState<AssessmentResponse[] | null>(null);
  const [browsePicked, setBrowsePicked] = useState<AssessmentResponse[]>([]);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  /* AI interviews: the same browse, over every config (the shared picker
     lists the active ones), picked by id. */
  const [browseConfigs, setBrowseConfigs] = useState<AIInterviewResponse[] | null>(null);
  const [browseIds, setBrowseIds] = useState<string[]>([]);
  /* Send hands over to the host's share step rather than sending here. */
  const handsOff = !bulk && (kind === 'assessment' ? !!onAssessmentsSent : !!onInterviewsSent);
  /* Step 2 (assessments): the share step, with what Next handed it. Step 1's
     state stays as it is underneath, so Back returns to it unchanged. */
  const [shareStep, setShareStep] = useState<{ assessments: AssessmentResponse[]; candidates: InviteCandidate[] } | null>(null);
  /* Step 2 (AI interviews): the picked interview(s), with the job and
     interview version each is shown under. */
  const [interviewStep, setInterviewStep] = useState<{
    configs: AIInterviewResponse[];
    candidates: InviteCandidate[];
    interviewVersions: Record<string, number>;
    jobVersions: Record<string, number>;
  } | null>(null);
  const openInterviewStep = (picked: { config: AIInterviewResponse; version?: number }[], candidates: InviteCandidate[]) => {
    const interviewVersions: Record<string, number> = {};
    const jobVersions: Record<string, number> = {};
    for (const { config, version } of picked) {
      if (version != null) interviewVersions[config.id] = version;
      // This JD row's own interview: the job version picked here, not the
      // config's creation-time `jd_version` snapshot.
      if (config.jd_id === jdId && jobVersionNumber) jobVersions[config.id] = jobVersionNumber;
    }
    setInterviewStep({ configs: picked.map((p) => p.config), candidates, interviewVersions, jobVersions });
    bodyRef.current?.scrollTo({ top: 0 });
  };
  /* The popup's footer: step 2 portals its own footer content into it. */
  const [footerEl, setFooterEl] = useState<HTMLDivElement | null>(null);
  const openShareStep = (assessments: AssessmentResponse[], candidates: InviteCandidate[]) => {
    setShareStep({ assessments, candidates });
    bodyRef.current?.scrollTo({ top: 0 });
  };
  /* The job an assessment is shared for. One of this JD row's own: this
     row, at the job version picked here — NOT the assessment's `jd_version`,
     a snapshot the backend stamps at creation that comes back as 1 for
     assessments authored against a later version (it labelled a V2 job's
     assessment "V1"; AssessmentResults resolves it the same way). A Browse
     all pick from another job keeps its own job and that snapshot. */
  const shareJob = (a: AssessmentResponse) => a.jd_id === jdId
    ? { jd_short_id: jdCode || a.jd_short_id, jd_title: jdTitle, jd_version: jobVersionNumber ?? a.jd_version }
    : { jd_short_id: a.jd_short_id, jd_title: a.jd_title || jdTitle, jd_version: a.jd_version };
  const backFromShareStep = () => {
    setShareStep(null);
    setInterviewStep(null);
    bodyRef.current?.scrollTo({ top: 0 });
  };
  const inStep2 = !!shareStep || !!interviewStep;
  const browseCount = kind === 'assessment' ? browsePicked.length : browseIds.length;
  const browseNoun = kind === 'assessment' ? 'assessment' : 'AI interview';
  /* Switching between this job's versions and the full list starts the pick
     over, as the original popup did. */
  const showBrowse = (on: boolean) => {
    setBrowseAll(on);
    setBrowsePicked([]);
    setBrowseIds([]);
    if (!on) return;
    if (kind === 'assessment' && browseList === null) {
      void loadBrowseAssessments()
        .then(setBrowseList)
        .catch(() => setBrowseList([]));
    }
    if (kind === 'interview' && browseConfigs === null) {
      void loadAllInterviewConfigs()
        .then(setBrowseConfigs)
        .catch(() => setBrowseConfigs([]));
    }
  };
  const shareBrowse = () => {
    if (kind === 'assessment') openShareStep(browsePicked, recipients);
    else openInterviewStep((browseConfigs ?? []).filter((c) => browseIds.includes(c.id)).map((config) => ({ config })), recipients);
  };
  /* Assessment View / Edit open over this popup — the assessment preview and
     the Configure popup the Assessments pages use — so the picks underneath
     stay as they are. */
  const [viewing, setViewing] = useState<AssessmentResponse | null>(null);
  const [editing, setEditing] = useState<AssessmentResponse | null>(null);
  /* AI interview View: the AI pickers' own Configure Details preview. */
  const [viewingInterviewId, setViewingInterviewId] = useState<string | null>(null);
  /* The Latest Active version is pre-ticked once, on the first load. */
  const preselected = useRef(false);
  /* When the list was last read — coming back to the tab re-reads it, at
     most this often unless this popup itself opened a Create / Edit. */
  const lastLoadedAt = useRef(0);

  /* Reads the versions; every state write is in the reply's callbacks, after
     the request. Resolves to the new list, or null when the load failed. */
  const applyVersions = (next: InviteVersion[]) => {
    lastLoadedAt.current = Date.now();
    setVersions(next);
    setLoaded(true);
    setLoading(false);
    setError(null);
    // Decided outside the updater, which must stay pure (it can run twice).
    const firstLoad = !preselected.current;
    preselected.current = true;
    const listed = listedVersions(kind, next);
    setVersionId((cur) => {
      if (cur && listed.some((v) => v.id === cur && v.sendable)) return cur;
      if (firstLoad) return listed.find((v) => v.sendable)?.id ?? null;
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
    loadVersions(kind, jdId).then(applyVersions, applyLoadError);
  const reload = () => {
    setLoading(true);
    setError(null);
    return fetchVersions();
  };

  const loadOnOpen = useEffectEvent(() => { if (!off) void fetchVersions(); });
  useEffect(() => { loadOnOpen(); }, []);

  /* Coming back to this tab: the versions are re-read, so one created,
     published or archived meanwhile — in the Assessments / AI Interviews
     module, or a Create / Edit this popup opened — shows without reopening
     the popup. Not while something here is running (a send, a confirmed
     action, a create), and at most every 10 seconds unless this popup opened
     the other tab itself. */
  const reloadAfterReturn = useEffectEvent(() => {
    if (off || sending || confirmBusy || creating || !loaded) return;
    if (document.visibilityState === 'hidden') return;
    const forced = reloadOnFocus.current;
    if (!forced && Date.now() - lastLoadedAt.current < 10_000) return;
    reloadOnFocus.current = false;
    // Refreshed in place — the cards stay up while the new list loads.
    void fetchVersions();
  });
  const closeOnEscape = useEffectEvent((e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    // Escape in an open ⋯ menu closes just the menu (it is still in the DOM
    // while this same keydown is being handled).
    if (document.querySelector('[role="menu"]')) return;
    // A View / Edit popup is on top: Escape closes the preview; Configure
    // closes from its own X, which asks about unsaved changes.
    if (viewing) { setViewing(null); return; }
    // The AI interview preview closes itself on Escape.
    if (viewingInterviewId) return;
    if (editing || creatingFirst || wizardHref) return;
    if (confirm && !confirmBusy) setConfirm(null);
    else if (!sending && !confirmBusy) onClose();
  });
  useEffect(() => {
    const onFocus = () => reloadAfterReturn();
    const onKey = (e: KeyboardEvent) => closeOnEscape(e);
    window.addEventListener('focus', onFocus);
    // A tab switch does not always focus the window; visibility does fire.
    document.addEventListener('visibilitychange', onFocus);
    // Capture phase: seen before a popup on top (the AI interview preview) or
    // an open ⋯ menu handles the same Escape and closes itself.
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);

  const selected = versions.find((v) => v.id === versionId) ?? null;
  const recipients = candidates.filter((c) => c.email && candidateIds.includes(c.id));
  /* How many the send goes to: the server selection's count in `bulk`. */
  const recipientCount = bulk ? selectionCount(serverSelection) + extras.length : recipients.length;
  /* Next: someone ticked — or, where Next leads to the email step, always:
     that step adds candidates itself (Manual, Upload Excel, Resume Database),
     so an empty list here is not a dead end. */
  const hasCandidatesForNext = bulk ? recipientCount > 0 : (recipients.length > 0 || handsOff);
  const blocked = createBlockedReason(versions, perms, kind);
  const returnUrl = `/recruitment/job-details?id=${encodeURIComponent(jdId)}`;
  const close = () => { if (!sending && !confirmBusy) onClose(); };

  /* New version — v1 is configured in the Configure popup in create mode;
     after that the latest version is duplicated as the next Draft, never
     overwriting one: an assessment draft opens in the Configure popup, an AI
     interview draft in the wizard popup (v1 there too, from Configure). */
  const handleCreate = () => {
    if (versions.length === 0 && kind === 'assessment') {
      /* The tenant's round defaults first, as the create page reads them;
         its own defaults if they cannot be read. */
      setCreating(true);
      void api.get('/assessments/settings/topics')
        .then((res) => res?.data ?? null, () => null)
        .then((topics) => setCreatingFirst({ topics }))
        .finally(() => setCreating(false));
      return;
    }
    if (versions.length === 0) {
      /* AI interview v1: the wizard, in its popup, from Configure. */
      setWizardHref(createPageHref(kind, jdId, jdTitle, returnUrl));
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
          // Re-read first: another tab may have used the last slot.
          const fresh = (await reload()) ?? versions;
          const why = createBlockedReason(fresh, perms, kind);
          if (why) { toast.error(why); return; }
          const draftId = await duplicateVersion(fresh[0]);
          toast.success(`v${nextVersionNumber(fresh)} created as a draft.`);
          const listed = await reload();
          /* The new draft opens straight in the Configure popup — ⋯ › Edit's
             popup — so it is edited and published here, with no navigation. */
          const draft = listed?.find((v) => v.id === draftId);
          if (kind === 'assessment' && draft) {
            try {
              setEditing(await loadAssessmentForPopup(draft, 'edit'));
            } catch (err) {
              toast.error((err as Error)?.message || 'Could not load the assessment. Please try again.');
            }
          } else if (draft) {
            /* An AI interview draft opens in the wizard popup, where it left off. */
            setWizardHref(await versionHref(draft, 'edit', jdTitle, returnUrl));
          }
        } finally {
          setCreating(false);
        }
      },
    });
  };

  const handleAction = (v: InviteVersion, item: VersionActionItem) => {
    if (item.disabledReason) return;
    if ((item.action === 'view' || item.action === 'edit') && v.kind === 'assessment') {
      const open = item.action === 'view' ? setViewing : setEditing;
      setBusyId(v.id);
      void loadAssessmentForPopup(v, item.action)
        .then(open, (err: unknown) => {
          toast.error((err as Error)?.message || 'Could not load the assessment. Please try again.');
          // The list may be stale (sent or changed elsewhere): re-read it.
          if (item.action === 'edit') void reload();
        })
        .finally(() => setBusyId(null));
      return;
    }
    if (item.action === 'view' && v.kind === 'interview') {
      setViewingInterviewId(v.id);
      return;
    }
    /* AI interview Edit is the full create / edit wizard — in its popup, over
       this one, so this popup keeps its picks; the list is re-read on close. */
    if (item.action === 'view' || item.action === 'edit') {
      setBusyId(v.id);
      void versionHref(v, item.action, jdTitle, returnUrl)
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

  /* Send the ONE picked version; `only` re-sends just those (Retry failed). */
  const send = (only?: InviteCandidate[]) => {
    if (!selected) return;
    const list = only ?? recipients;
    const keep = only ? results.filter((r) => !only.some((c) => c.id === r.candidateId)) : [];
    setView('results');
    setSending(true);
    setSendTotal(keep.length + list.length);
    setResults(keep);
    void sendVersion(selected, list, { method, message, expiryDays }, (_d, _t, result) => {
      setResults((prev) => [...prev, result]);
    }).then((done) => {
      setSending(false);
      const sent = done.filter((r) => r.status === 'sent').length;
      if (sent > 0) onSent?.(kind, sent);
      void reload();
    });
  };

  /* `bulk`: one request with the selection; the backend resolves it, skips
     what cannot be sent, and sends in the background. The popup switches to
     the run's progress, which the floating widget keeps following after
     Done. A refused start (quota, permission, version) is thrown to the
     confirm's own error toast. */
  const sendBulk = async () => {
    if (!selected) return;
    const job = await bulkInviteService.start(jdId, {
      kind,
      version_id: selected.id,
      selection: toRequestSelection(serverSelection),
      extra_candidates: extras.length ? extras : undefined,
      delivery: kind === 'interview' ? method : 'email',
      message: method === 'email' ? message : undefined,
      expiry_days: expiryDays,
    });
    bulkReported.current = false;
    setBulkJob(job);
    bulkTracker?.track(job, { jdTitle, jdCode });
    setView('progress');
    bodyRef.current?.scrollTo({ top: 0 });
    const queued = job.queued ?? 0;
    if (queued === 0) toast.info('Nothing to send — every selected candidate was skipped (see the reasons below)');
    else toast.success(`Sending ${queued.toLocaleString()} invitation${queued === 1 ? '' : 's'} in the background`);
  };
  /* The run's snapshots: once it ends with something sent, the host is told
     once (its counts refresh) and the version cards re-read their totals. */
  const onBulkJobChange = (job: BulkInviteJob) => {
    setBulkJob(job);
    if (job.status === 'queued' || job.status === 'running' || bulkReported.current) return;
    bulkReported.current = true;
    if (job.sent > 0) onSent?.(kind, job.sent);
    void reload();
  };

  const askSend = () => {
    if (!selected?.sendable || !hasCandidatesForNext) return;
    if (bulk) {
      const links = method === 'link';
      const scope = serverSelection.mode === 'filter'
        ? ` (everyone matching ${describeFilters(serverSelection.filters) || 'the current tab'})` : '';
      setConfirm({
        title: `${links ? 'Create invitation links for' : 'Send'} ${label.singular} V${selected.version}?`,
        message: `${links ? 'Creates personal links for' : 'Sends'} ${selected.name} V${selected.version} to ${recipientCount.toLocaleString()} candidate${recipientCount === 1 ? '' : 's'}${scope}. Anyone already invited to this version, team members, repeated emails and candidates without an email are skipped. The send runs in the background — you can close this popup once it starts.`,
        confirmText: links ? 'Create Links' : 'Send Invitations',
        run: sendBulk,
      });
      return;
    }
    /* Assessments: no send from here — Next moves to the Share Assessment via
       Email step with the picked version and the ticked candidates. */
    if (kind === 'assessment' && onAssessmentsSent) {
      if (!selected.raw) return;
      openShareStep([selected.raw], recipients);
      return;
    }
    if (kind === 'interview' && onInterviewsSent) {
      if (!selected.config) return;
      openInterviewStep([{ config: selected.config, version: selected.version }], recipients);
      return;
    }
    const links = method === 'link';
    setConfirm({
      title: `${links ? 'Create invitation links for' : 'Send'} ${label.singular} V${selected.version}?`,
      message: `${links ? 'Creates personal links for' : 'Sends'} ${selected.name} V${selected.version} to ${recipientCount} candidate${recipientCount === 1 ? '' : 's'}. Anyone already invited to this version is skipped.`,
      confirmText: links ? 'Create Links' : 'Send Invitations',
      run: async () => send(),
    });
  };

  const failed = candidates.filter((c) => results.some((r) => r.candidateId === c.id && r.status === 'failed'));
  const canSend = !!selected?.sendable && hasCandidatesForNext && perms.canInvite && !off;
  const count = (s: SendResult['status']) => results.filter((r) => r.status === s).length;

  /* The Invite popups' footer sentence: what is missing, then what is about to happen. */
  const footerText = off
    ? ''
    : browseAll
      ? (browseCount === 0
          ? `Select at least one ${browseNoun} to continue`
          : recipientCount === 0 ? (handsOff ? 'No candidates ticked · add them in the next step' : '') : null)
    : view === 'progress'
      ? (bulkJob && (bulkJob.status === 'queued' || bulkJob.status === 'running') ? 'Sending in the background — safe to close' : '')
    : view === 'results'
      ? (sending ? `Sending ${results.length} of ${sendTotal}…` : `${count('sent')} sent · ${count('skipped')} skipped · ${count('failed')} failed`)
      : !selected
        ? `Select ${label.singular === 'Assessment' ? 'an assessment' : 'an AI interview'} version to continue`
        : recipientCount === 0
          ? (handsOff ? 'No candidates ticked · add them in the next step' : '')
          : null;

  const Icon = kind === 'assessment' ? ClipboardList : Video;

  return (
    <>
      {/* Shell, header, body and footer are the Invite to Assessment / AI
          Interview popups', class for class. */}
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
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-slate-500 min-w-0">
                  {jdCode && <JobIdBadge>{jdCode}</JobIdBadge>}
                  <span className="min-w-0 truncate">{jdTitle}</span>
                  {/* The job version — the same blue chip step 2 shows, no wording. */}
                  {jobVersionNumber ? <VersionChip kind="job" version={jobVersionNumber} /> : null}
                </div>
              </div>
            </div>
            {/* No X — the footer's Cancel closes, as on the Invite popups. */}
          </div>

          <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
            {off ? (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 py-10 px-4 text-center text-sm text-gray-600 dark:text-slate-400">{off}</div>
            ) : interviewStep ? (
              /* Step 2 — Send AI Interview via Email in place of the content,
                 one picked interview after another; this popup's header and
                 footer stay (the step fills the footer). */
              <AIInterviewShareQueue
                configs={interviewStep.configs}
                candidates={interviewStep.candidates.map((c) => ({ name: c.name, email: c.email, resumeId: c.resumeId }))}
                interviewVersions={interviewStep.interviewVersions}
                jobVersions={interviewStep.jobVersions}
                inPopupStep
                footerTarget={footerEl}
                onBack={backFromShareStep}
                onInvited={onInterviewsSent}
                onClose={onClose}
              />
            ) : shareStep ? (
              /* Step 2 — Share Assessment via Email in place of the content;
                 this popup's header and footer stay (its footer is filled by
                 the step: summary, Back, Send Invitations). */
              <ShareAssessmentModal
                isOpen
                embedded
                footerTarget={footerEl}
                onClose={onClose}
                onBack={backFromShareStep}
                assessment={{
                  id: shareStep.assessments[0].id,
                  title: shareStep.assessments[0].title,
                  duration: `${shareStep.assessments[0].duration_minutes || 30} min`,
                  questions: (shareStep.assessments[0].hr_enabled ? 1 : 0)
                    + (shareStep.assessments[0].technical_enabled ? 1 : 0)
                    + (shareStep.assessments[0].coding_enabled ? 1 : 0),
                  type: 'AI-Generated',
                  short_id: shareStep.assessments[0].short_id,
                  version: shareStep.assessments[0].version,
                  ...shareJob(shareStep.assessments[0]),
                }}
                additionalAssessments={shareStep.assessments.slice(1).map((a) => ({
                  id: a.id,
                  title: a.title,
                  duration: `${a.duration_minutes || 30} min`,
                  questions: (a.hr_enabled ? 1 : 0) + (a.technical_enabled ? 1 : 0) + (a.coding_enabled ? 1 : 0),
                  type: 'AI-Generated',
                  short_id: a.short_id,
                  version: a.version,
                  ...shareJob(a),
                }))}
                /* The ticked candidates, pre-filled, under the source this
                   hand-over has always sent with. */
                prefilledCandidates={shareStep.candidates.map((c) => ({
                  id: c.id,
                  name: c.name,
                  email: c.email,
                  phone: c.phone,
                  source: 'database' as const,
                  resumeId: c.resumeId,
                  /* Recorded per candidate: the Job Details tab they were
                     ticked on. Anyone added in this step (Manual, Excel,
                     Select From) keeps Manual / Internal DB. */
                  inviteSource: c.source ? INVITE_SOURCE_BY_TAB[c.source] : 'JD',
                }))}
                /* Only a real send counts: nothing is added when every
                   invitation failed or was already sent. */
                onInviteSent={(count) => { if (count > 0) onAssessmentsSent?.(count); }}
              />
            ) : browseAll ? (
              /* The original Browse all view: back to the cards, the shared
                 cross-job picker, then who it goes to. */
              <div className="space-y-6">
                <section aria-label={kind === 'assessment' ? 'All assessments' : 'All AI interviews'}>
                  <button
                    type="button"
                    onClick={() => showBrowse(false)}
                    className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-brand-blue hover:text-brand-blue-2 hover:underline underline-offset-2"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                    Back to this job&apos;s {browseNoun} versions
                  </button>
                  {kind === 'interview' ? (
                    browseConfigs === null ? (
                      <div className="flex items-center justify-center py-12 tf-loader-center tf-loader-center--compact">
                        <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
                      </div>
                    ) : (
                      <AIInterviewPicker
                        configs={browseConfigs}
                        multiple
                        selection={null}
                        onSelectionChange={() => {}}
                        selectedIds={browseIds}
                        onSelectedIdsChange={setBrowseIds}
                        scrollContainerRef={bodyRef}
                      />
                    )
                  ) : browseList === null ? (
                    <div className="flex items-center justify-center py-12 tf-loader-center tf-loader-center--compact">
                      <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
                    </div>
                  ) : (
                    <AssessmentPicker
                      assessments={browseList}
                      multiple
                      selectedIds={browsePicked.map((a) => a.id)}
                      onSelectionChange={setBrowsePicked}
                      scrollContainerRef={bodyRef}
                    />
                  )}
                </section>
                <section aria-label="Send to" className="rounded-xl border border-gray-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 p-3 sm:p-4">
                  <SendToPanel
                    kind={kind}
                    candidates={candidates}
                    selectedIds={candidateIds}
                    onSelectedIds={setCandidateIds}
                    method={method}
                    onMethod={setMethod}
                    message={message}
                    onMessage={setMessage}
                    expiryDays={expiryDays}
                    onExpiry={setExpiryDays}
                    candidatesOnly
                    addInNextStep={handsOff}
                  />
                </section>
              </div>
            ) : view === 'progress' && bulkJob ? (
              /* `bulk`: the run's live counts and per-candidate rows; the
                 floating widget keeps following it after this popup closes. */
              <BulkInviteProgressPanel jobId={bulkJob.job_id} initialJob={bulkJob} compact onJobChange={onBulkJobChange} />
            ) : view === 'results' ? (
              <ResultsStep results={results} total={sendTotal} sending={sending} />
            ) : (
              <div className="space-y-6">
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
                <section aria-label="Send to" className="rounded-xl border border-gray-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 p-3 sm:p-4">
                  <SendToPanel
                    kind={kind}
                    candidates={candidates}
                    selectedIds={candidateIds}
                    onSelectedIds={setCandidateIds}
                    method={method}
                    onMethod={setMethod}
                    message={message}
                    onMessage={setMessage}
                    expiryDays={expiryDays}
                    onExpiry={setExpiryDays}
                    /* Just the candidates when Send hands over to the share
                       step — Share Assessment via Email / Send AI Interview
                       via Email has its own delivery, message and expiry. */
                    candidatesOnly={handsOff}
                    addInNextStep={handsOff}
                    listSlot={bulk ? (
                      <div className="space-y-4">
                        <ServerCandidatePicker
                          jdId={jdId}
                          kind={kind}
                          versionId={selected?.sendable ? selected.id : null}
                          selection={serverSelection}
                          onSelectionChange={setServerSelection}
                          pickingDisabled={!selected?.sendable || !perms.canInvite || !!off}
                        />
                        {/* The share step's Manual / Upload Excel, kept on the bulk path. */}
                        <ExtraCandidatesInput onChange={setExtras} disabled={!selected?.sendable || !perms.canInvite || !!off} />
                      </div>
                    ) : undefined}
                  />
                </section>
              </div>
            )}
          </div>

          <div ref={setFooterEl} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-6 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 shrink-0">
            {!inStep2 && (<>
            <div className="min-w-0 sm:truncate sm:whitespace-nowrap text-sm text-gray-700 dark:text-slate-300">
              {footerText ?? (browseAll ? (
                <span className="inline-flex items-center gap-1.5 align-middle">
                  <CheckCircle className="w-4 h-4 text-brand-blue flex-shrink-0" />
                  Ready to invite {recipientCount} candidate{recipientCount === 1 ? '' : 's'} to {browseCount} {browseNoun}{browseCount === 1 ? '' : 's'}{handsOff ? ' · add more in the next step' : ''}
                </span>
              ) : selected && (
                <span className="inline-flex items-center gap-1.5 align-middle">
                  <CheckCircle className="w-4 h-4 text-brand-blue flex-shrink-0" />
                  Ready to invite {recipientCount} candidate{recipientCount === 1 ? '' : 's'} to {label.singular} V{selected.version}{handsOff ? ' · add more in the next step' : ''}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 sm:gap-3 w-full sm:w-auto">
              {browseAll ? (
                <>
                  <Button variant="secondary" onClick={close} className="flex-1 sm:flex-none !h-9">
                    Cancel
                  </Button>
                  {/* The original hand-over: the share step, pre-filled. */}
                  <button
                    onClick={shareBrowse}
                    disabled={browseCount === 0 || !hasCandidatesForNext || !perms.canInvite}
                    title={!perms.canInvite ? (!inviteAllowed && inviteDeniedReason ? inviteDeniedReason : `You do not have permission to invite to ${label.plural.toLowerCase()}`) : undefined}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-colors shadow-md shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ArrowRight className="w-4 h-4" />
                    Next
                  </button>
                </>
              ) : view === 'progress' ? (
                <button
                  onClick={onClose}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-colors shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
                >
                  Done
                </button>
              ) : view === 'results' ? (
                <>
                  {!sending && failed.length > 0 && (
                    <Button variant="secondary" onClick={() => send(failed)} className="flex-1 sm:flex-none !h-9">
                      Retry failed ({failed.length})
                    </Button>
                  )}
                  <button
                    onClick={onClose}
                    disabled={sending}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-colors shadow-md shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Done
                  </button>
                </>
              ) : (
                <>
                  <Button variant="secondary" onClick={close} className="flex-1 sm:flex-none !h-9">
                    Cancel
                  </Button>
                  <button
                    onClick={askSend}
                    disabled={!canSend}
                    title={!perms.canInvite ? (!inviteAllowed && inviteDeniedReason ? inviteDeniedReason : `You do not have permission to invite to ${label.plural.toLowerCase()}`) : undefined}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-colors shadow-md shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {handsOff ? <ArrowRight className="w-4 h-4" /> : method === 'link' ? <Link2 className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                    {handsOff
                      ? 'Next'
                      : selected ? `${method === 'link' ? 'Create links for' : 'Send with'} V${selected.version}` : 'Send Invitations'}
                  </button>
                </>
              )}
            </div>
            </>)}
          </div>

          {/* In-popup confirmation, over the whole card. */}
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

      {/* View / Edit, over this popup (rendered after it, so on top). Closing
          either comes back here with the version and candidates as they were. */}
      {viewing && (
        <AssessmentPreviewModal
          isOpen
          onClose={() => setViewing(null)}
          assessment={viewing}
          jobContext={{ jobVersionNumber }}
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
          /* Saved as a draft or published: the cards are re-read in place,
             keeping the picked version (while it can still be sent) and the
             ticked candidates. */
          onSaved={() => void fetchVersions()}
        />
      )}
      {/* AI interview create / edit: the wizard in its popup. Closing it —
          or Save as Draft, Discard, Publish — re-reads the versions. */}
      {wizardHref && (
        <AIInterviewWizardDialog
          startHref={wizardHref}
          jdCode={jdCode}
          jdTitle={jdTitle}
          onClose={() => {
            setWizardHref(null);
            void fetchVersions();
          }}
        />
      )}
      {/* v1: the same Configure popup, creating the job's first assessment. */}
      {creatingFirst && (
        <AssessmentConfigureModal
          isOpen
          create
          topicSettings={creatingFirst.topics ?? undefined}
          onClose={() => setCreatingFirst(null)}
          assessment={{ jd_id: jdId, jd_short_id: jdCode, jd_title: jdTitle, jd_version: jobVersionNumber }}
          onSaved={() => void fetchVersions()}
        />
      )}
    </>
  );
}
