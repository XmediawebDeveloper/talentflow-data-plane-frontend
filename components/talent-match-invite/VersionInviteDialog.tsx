'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ArrowLeft, Brain, CheckCircle, ClipboardCheck, Link2, Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { useAuth } from '@/lib/hooks/useAuth';
import VersionList, { VersionUsage } from './VersionList';
import SendToPanel from './SendToPanel';
import ResultsStep from './ResultsStep';
import AssessmentPicker from '@/components/assessments/AssessmentPicker';
import AssessmentPreviewModal from '@/components/AssessmentPreviewModal';
import AssessmentConfigureModal from '@/components/AssessmentConfigureModal';
import AIInterviewPicker from '@/components/ai-interview/AIInterviewPicker';
import ConfigurePreviewDialog from '@/components/ai-interview/ConfigurePreviewDialog';
import type { AIInterviewResponse } from '@/lib/services/aiInterviewService';
import type { AssessmentResponse } from '@/lib/services/assessmentService';
import {
  KIND_LABEL,
  createBlockedReason,
  createPageHref,
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
 * class for class): the type's version cards (up to MAX_VERSIONS_PER_TYPE per
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
  onShare,
  onShareInterviews,
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
  /** Assessment popup: Send opens the host's Share Assessment via Email step
   *  with the picked assessment(s) and the ticked candidates — nothing is sent
   *  from this popup. Given it, the popup also offers "Browse all assessments
   *  instead" (the original cross-job list: search, Select All, Grouped /
   *  Ungrouped), whose Send hands over the same way. */
  onShare?: (assessments: AssessmentResponse[], candidates: InviteCandidate[]) => void;
  /** AI Interview popup, the same pattern: Send opens the host's Send AI
   *  Interview via Email step with the picked interview(s) and the ticked
   *  candidates — that step sends — and "Browse all AI interviews instead"
   *  offers the original cross-job AI interview list. */
  onShareInterviews?: (interviews: AIInterviewResponse[], candidates: InviteCandidate[]) => void;
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
      };
  const label = KIND_LABEL[kind];
  const off = disabledReason || null;

  const [versions, setVersions] = useState<InviteVersion[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(!off);
  const [error, setError] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [candidateIds, setCandidateIds] = useState<string[]>(() => candidates.filter((c) => c.email).map((c) => c.id));
  const [method, setMethod] = useState<DeliveryMethod>('email');
  const [message, setMessage] = useState('');
  const [expiryDays, setExpiryDays] = useState(1);
  const [view, setView] = useState<'compose' | 'results'>('compose');
  const [results, setResults] = useState<SendResult[]>([]);
  const [sending, setSending] = useState(false);
  const [sendTotal, setSendTotal] = useState(0);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [creating, setCreating] = useState(false);
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
  const handsOff = kind === 'assessment' ? !!onShare : !!onShareInterviews;
  const canBrowse = handsOff;
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
    if (kind === 'assessment') onShare?.(browsePicked, recipients);
    else onShareInterviews?.((browseConfigs ?? []).filter((c) => browseIds.includes(c.id)), recipients);
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

  /* Reads the versions; every state write is in the reply's callbacks, after
     the request. Resolves to the new list, or null when the load failed. */
  const applyVersions = (next: InviteVersion[]) => {
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

  const reloadAfterReturn = useEffectEvent(() => {
    if (!reloadOnFocus.current) return;
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
    if (editing) return;
    if (confirm && !confirmBusy) setConfirm(null);
    else if (!sending && !confirmBusy) onClose();
  });
  useEffect(() => {
    const onFocus = () => reloadAfterReturn();
    const onKey = (e: KeyboardEvent) => closeOnEscape(e);
    window.addEventListener('focus', onFocus);
    // Capture phase: seen before a popup on top (the AI interview preview) or
    // an open ⋯ menu handles the same Escape and closes itself.
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);

  const selected = versions.find((v) => v.id === versionId) ?? null;
  const recipients = candidates.filter((c) => c.email && candidateIds.includes(c.id));
  const blocked = createBlockedReason(versions, perms, kind);
  const returnUrl = `/recruitment/job-details?id=${encodeURIComponent(jdId)}`;
  const openInNewTab = (href: string) => window.open(href, '_blank', 'noopener');
  const close = () => { if (!sending && !confirmBusy) onClose(); };

  /* New version — v1 opens the full create flow; after that the latest
     version is duplicated as the next Draft, never overwriting one. */
  const handleCreate = () => {
    if (versions.length === 0) {
      reloadOnFocus.current = true;
      openInNewTab(createPageHref(kind, jdId, jdTitle, returnUrl));
      toast.info(`${label.singular} creation opened in a new tab. Come back here when it is published.`);
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
          await duplicateVersion(fresh[0]);
          toast.success(`v${nextVersionNumber(fresh)} created as a draft.`);
          await reload();
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
    /* AI interview Edit is the full create / edit wizard, a page of its own
       (there is no edit popup for it): a new tab, so this popup keeps its
       picks, and the list is re-read on coming back. */
    if (item.action === 'view' || item.action === 'edit') {
      if (item.action === 'edit') reloadOnFocus.current = true;
      void versionHref(v, item.action, jdTitle, returnUrl).then(openInNewTab);
      return;
    }
    if (!item.confirm) return;
    setConfirm({
      ...item.confirm,
      run: async () => {
        setBusyId(v.id);
        try {
          if (item.action === 'duplicate') {
            const fresh = (await reload()) ?? versions;
            const why = createBlockedReason(fresh, perms, kind);
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
      toast.error((err as Error)?.message || 'Something went wrong. Please try again.');
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

  const askSend = () => {
    if (!selected?.sendable || recipients.length === 0) return;
    /* Assessments: no send from here — the picked version and the ticked
       candidates go to Share Assessment via Email, which sends. */
    if (kind === 'assessment' && onShare) {
      if (!selected.raw) return;
      onShare([selected.raw], recipients);
      return;
    }
    if (kind === 'interview' && onShareInterviews) {
      if (!selected.config) return;
      onShareInterviews([selected.config], recipients);
      return;
    }
    const links = method === 'link';
    setConfirm({
      title: `${links ? 'Create invitation links for' : 'Send'} ${label.singular} V${selected.version}?`,
      message: `${links ? 'Creates personal links for' : 'Sends'} ${selected.name} V${selected.version} to ${recipients.length} candidate${recipients.length === 1 ? '' : 's'}. Anyone already invited to this version is skipped.`,
      confirmText: links ? 'Create Links' : 'Send Invitations',
      run: async () => send(),
    });
  };

  const failed = candidates.filter((c) => results.some((r) => r.candidateId === c.id && r.status === 'failed'));
  const canSend = !!selected?.sendable && recipients.length > 0 && perms.canInvite && !off;
  const count = (s: SendResult['status']) => results.filter((r) => r.status === s).length;

  /* The Invite popups' footer sentence: what is missing, then what is about to happen. */
  const footerText = off
    ? ''
    : browseAll
      ? (recipients.length === 0
          ? 'Select at least one candidate to continue'
          : browseCount === 0 ? `Select at least one ${browseNoun} to continue` : null)
    : view === 'results'
      ? (sending ? `Sending ${results.length} of ${sendTotal}…` : `${count('sent')} sent · ${count('skipped')} skipped · ${count('failed')} failed`)
      : candidates.length === 0 || recipients.length === 0
        ? 'Select at least one candidate to continue'
        : !selected
          ? `Select ${label.singular === 'Assessment' ? 'an assessment' : 'an AI interview'} version to continue`
          : null;

  const Icon = kind === 'assessment' ? ClipboardCheck : Brain;

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
                  {jobVersionNumber ? (
                    <span className="font-semibold px-1.5 py-0.5 rounded-md bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">Job V{jobVersionNumber}</span>
                  ) : null}
                </div>
              </div>
            </div>
            {/* No X — the footer's Cancel closes, as on the Invite popups. */}
          </div>

          <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
            {off ? (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 py-10 px-4 text-center text-sm text-gray-600 dark:text-slate-400">{off}</div>
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
                  />
                </section>
              </div>
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
                  />
                  {canBrowse && (
                    <button
                      type="button"
                      onClick={() => showBrowse(true)}
                      className="mt-3 text-xs font-medium text-brand-blue hover:text-brand-blue-2 hover:underline underline-offset-2"
                    >
                      Browse all {kind === 'assessment' ? 'assessments' : 'AI interviews'} instead
                    </button>
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
                    /* Just the candidates when Send hands over to the share
                       step — Share Assessment via Email / Send AI Interview
                       via Email has its own delivery, message and expiry. */
                    candidatesOnly={handsOff}
                  />
                </section>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-6 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 shrink-0">
            <div className="min-w-0 sm:truncate sm:whitespace-nowrap text-xs sm:text-sm text-gray-700 dark:text-slate-300">
              {footerText ?? (browseAll ? (
                <span className="inline-flex items-center gap-1.5 align-middle">
                  <CheckCircle className="w-4 h-4 text-brand-blue flex-shrink-0" />
                  Ready to invite {recipients.length} candidate{recipients.length === 1 ? '' : 's'} to {browseCount} {browseNoun}{browseCount === 1 ? '' : 's'}
                </span>
              ) : selected && (
                <span className="inline-flex items-center gap-1.5 align-middle">
                  <CheckCircle className="w-4 h-4 text-brand-blue flex-shrink-0" />
                  Ready to invite {recipients.length} candidate{recipients.length === 1 ? '' : 's'} to {label.singular} V{selected.version}
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
                    disabled={browseCount === 0 || recipients.length === 0 || !perms.canInvite}
                    title={!perms.canInvite ? `You do not have permission to invite to ${label.plural.toLowerCase()}` : undefined}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-colors shadow-md shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Mail className="w-4 h-4" />
                    Send Invitations
                  </button>
                </>
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
                    title={!perms.canInvite ? `You do not have permission to invite to ${label.plural.toLowerCase()}` : undefined}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-colors shadow-md shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {method === 'link' ? <Link2 className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                    {handsOff
                      ? 'Send'
                      : selected ? `${method === 'link' ? 'Create links for' : 'Send with'} V${selected.version}` : 'Send Invitations'}
                  </button>
                </>
              )}
            </div>
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
        <ConfigurePreviewDialog configId={viewingInterviewId} onClose={() => setViewingInterviewId(null)} />
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
    </>
  );
}
