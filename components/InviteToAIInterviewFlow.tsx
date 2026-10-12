'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Brain, CheckCircle, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { aiInterviewService, type AIInterviewResponse } from '@/lib/services/aiInterviewService';
import AIInterviewPicker, { type AIInterviewPickerSelection } from '@/components/ai-interview/AIInterviewPicker';
import JobInterviewVersionPicker, { latestActiveInterviewConfig } from '@/components/ai-interview/JobInterviewVersionPicker';
import { interviewVersionOrdinal } from '@/lib/utils/aiInterviewVersion';
import ShareAIInterviewModal from '@/components/ai-interview/ShareAIInterviewModal';
import SelectedCandidatesPanel from '@/components/SelectedCandidatesPanel';
import type { Resume } from '@/lib/types/types';

/** The minimum a resume row needs to become an interview invite. */
export interface AIInterviewInviteCandidate {
  id: string;
  name: string;
  email?: string;
}

interface InviteToAIInterviewFlowProps {
  open: boolean;
  onClose: () => void;
  /** The selected resumes, in the order they should be invited. */
  candidates: AIInterviewInviteCandidate[];
  /** Fired once invitations are away — the caller clears its selection. */
  onInvited?: () => void;
  /** The full resume rows behind those candidates. Given them, the dialog shows
   *  the shared Candidates Selected panel — untick to drop someone, see the
   *  resume version, read a resume — instead of a bare count. */
  resumes?: Resume[];
  /** The JD the candidates were matched against (AI Talent Match). Given it,
   *  the dialog lists only THAT job's interview versions to pick from, rather
   *  than every interview across all jobs. */
  jobId?: string;
  /** With `jobId`: open with that job's latest Active interview version
   *  already picked (the one tagged "Latest" — the only one when there is
   *  just one), instead of nothing. */
  preselectLatest?: boolean;
  /** Opt-in: pick SEVERAL interviews (checkboxes + Select All, as the Invite
   *  to Assessment dialog's `multiple`). Send then runs the existing share
   *  step once per picked interview, one after another — each send exactly
   *  as a single pick's. Omitted, one interview per invite, as before. */
  multiple?: boolean;
  /** `jobId`'s own job version, when the host knows it (Job Details) — heads
   *  the version cards, as on the Invite to Assessment dialog. */
  jobVersionNumber?: number;
  /** Opt-in (Job Details): with `jobId`, the version cards list ONLY the AI
   *  interview that job version is mapped to — the live interview
   *  `findLiveConfigForJd` returns, the one Job Details itself uses — never
   *  several versions for one job version or another job version's. */
  mappedVersionOnly?: boolean;
  /** Opt-in: how a candidate's name is SHOWN in the Candidates list. Display
   *  only; the names sent on are the originals. */
  formatCandidateName?: (name: string) => string;
}

/**
 * Two-step "invite selected candidates to an AI interview" flow: pick a
 * published interview, then send through the AI Interviews module's own share
 * modal with the candidates pre-filled.
 *
 * Lives here rather than in a page so My Resumes and the Internal Database
 * offer the identical action — the two lists had already drifted apart once.
 */
export default function InviteToAIInterviewFlow({
  open,
  onClose,
  candidates,
  onInvited,
  resumes,
  jobId,
  preselectLatest = false,
  multiple = false,
  jobVersionNumber,
  mappedVersionOnly = false,
  formatCandidateName,
}: InviteToAIInterviewFlowProps) {
  /** Escape hatch from the job-scoped picker to the full list. */
  const [browseAll, setBrowseAll] = useState(false);
  const jobScoped = !!jobId && !browseAll;
  const [configs, setConfigs] = useState<AIInterviewResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  /** `mappedVersionOnly`: the job version's mapped interview id, null when it
   *  has none; undefined when not asked for. */
  const [mappedId, setMappedId] = useState<string | null | undefined>(undefined);
  const [selection, setSelection] = useState<AIInterviewPickerSelection | null>(null);
  const selectedConfig = selection ? configs.find((c) => c.id === selection.interviewId) ?? null : null;
  /** Multi-select's picks (`multiple`), in the order they were ticked. */
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  /* What Send goes out with: every pick in multi-select, else the one. */
  const pickedConfigs = multiple
    ? pickedIds.map((id) => configs.find((c) => c.id === id)).filter((c): c is AIInterviewResponse => !!c)
    : selectedConfig ? [selectedConfig] : [];
  const pickedCount = pickedConfigs.length;
  /* One picked version in the job view: named on the footer and the button
     ("Send with V2"), as the Invite to Assessment dialog names its pick. */
  const singlePick = jobScoped && pickedCount === 1 ? pickedConfigs[0] : null;
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  /** The share step's queue — the picked interviews, sent one at a time. */
  const [shareQueue, setShareQueue] = useState<AIInterviewResponse[]>([]);
  const [shareIndex, setShareIndex] = useState(0);
  /* The share step calls onInviteSent THEN onClose: `advancingRef` tells that
     onClose to move on to the next interview rather than end the flow, and
     `sentRef` / `invitedRef` report a send once, even if the recruiter
     cancels part-way through the queue. */
  const advancingRef = useRef(false);
  const sentRef = useRef(false);
  const invitedRef = useRef(false);
  const [prefilled, setPrefilled] = useState<{ name: string; email: string; resumeId?: string }[]>([]);
  /** Candidates unticked in the panel — listed, but not invited. */
  const [excludedIds, setExcludedIds] = useState<string[]>([]);

  const invitees = candidates.filter((candidate) => !excludedIds.includes(candidate.id));
  /* Opened with nobody preset (a job page's Invite): pick the interview here,
     then add the candidates in the share step, as that page always did. */
  const noPresetCandidates = candidates.length === 0;

  // Every config, archived included — the shared picker lists only the active
  // ones, but needs the rest to number interview versions and group jobs the
  // way the AI Interview page does. Fetched on first open, then reused.
  useEffect(() => {
    if (!open || hasLoaded) return;
    setHasLoaded(true);
    setIsLoading(true);
    (async () => {
      const live: AIInterviewResponse[] = [];
      for (let page = 1; ; page += 1) {
        const batch = await aiInterviewService.listConfigs({ page, page_size: 100, compact: true });
        const items = batch.items || [];
        live.push(...items);
        if (items.length < 100 || live.length >= (batch.total ?? live.length)) break;
      }
      const archivedProbe = await aiInterviewService.listConfigs({ status: 'archived', page_size: 1, compact: true });
      const archived = archivedProbe.total > archivedProbe.items.length
        ? (await aiInterviewService.listConfigs({ status: 'archived', page_size: archivedProbe.total, compact: true })).items
        : archivedProbe.items;
      const seen = new Set<string>();
      const all = [...live, ...archived].filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
      // The job version's mapping, resolved with the list so the cards and
      // the pre-pick never show anything else first.
      const mapped = mappedVersionOnly && jobId ? await aiInterviewService.findLiveConfigForJd(jobId) : undefined;
      return { all, mapped };
    })()
      .then(({ all, mapped }) => {
        setConfigs(all);
        if (mapped !== undefined) setMappedId(mapped?.id ?? null);
      })
      .catch(() => {
        toast.error('Failed to load AI interviews');
        setConfigs([]);
        if (mappedVersionOnly) setMappedId(null);
      })
      .finally(() => setIsLoading(false));
  }, [open, hasLoaded, mappedVersionOnly, jobId]);

  /* Pre-pick the job's latest Active version once per opening, after the
     configs load — never over a choice the user has already made. */
  const autoPickedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      autoPickedRef.current = false;
      return;
    }
    if (!preselectLatest || !jobScoped || isLoading || autoPickedRef.current || selection || pickedIds.length > 0) return;
    const latest = mappedVersionOnly
      ? configs.find((c) => c.id === mappedId)
      : latestActiveInterviewConfig(configs, jobId as string);
    if (!latest) return;
    autoPickedRef.current = true;
    if (multiple) setPickedIds([latest.id]);
    else setSelection({ jobKey: latest.id, jdId: latest.jd_id, interviewId: latest.id });
  }, [open, preselectLatest, jobScoped, isLoading, configs, jobId, selection, pickedIds, multiple, mappedVersionOnly, mappedId]);

  const closePicker = () => {
    setSelection(null);
    setPickedIds([]);
    setBrowseAll(false);
    setExcludedIds([]);
    onClose();
  };

  /* Opens the share step on the first picked interview. */
  const startSharing = (withCandidates: { name: string; email: string; resumeId?: string }[]) => {
    setPrefilled(withCandidates);
    setShareQueue(pickedConfigs);
    setShareIndex(0);
    advancingRef.current = false;
    sentRef.current = false;
    invitedRef.current = false;
    setIsSharing(true);
  };

  const proceedToShare = () => {
    if (pickedCount === 0) return;
    if (noPresetCandidates) {
      startSharing([]);
      return;
    }
    // Only candidates with an email can be invited — the rest would fail
    // server-side with nothing to send to.
    const withEmail = invitees
      .filter((candidate) => candidate.email)
      .map((candidate) => ({ name: candidate.name, email: candidate.email as string, resumeId: candidate.id }));

    if (invitees.length === 0) {
      toast.error('Tick at least one candidate to invite');
      return;
    }
    if (withEmail.length === 0) {
      toast.error('Selected resumes must have email addresses');
      return;
    }
    const skipped = invitees.length - withEmail.length;
    if (skipped > 0) {
      toast.warning(`${skipped} resume${skipped > 1 ? 's' : ''} skipped — no email address on file`);
    }

    startSharing(withEmail);
  };

  const closeShare = () => {
    setIsSharing(false);
    setShareQueue([]);
    setShareIndex(0);
    setBrowseAll(false);
    setSelection(null);
    setPickedIds([]);
    setPrefilled([]);
    setExcludedIds([]);
    onClose();
  };
  /* Reports the sends to the host once — after the last interview, or when
     the recruiter stops part-way with some already sent. */
  const reportInvited = () => {
    if (!sentRef.current || invitedRef.current) return;
    invitedRef.current = true;
    onInvited?.();
  };

  const sharingConfig = isSharing ? shareQueue[shareIndex] : undefined;
  if (sharingConfig) {
    return (
      <ShareAIInterviewModal
        /* Keyed per interview: the modal reads its candidates once on mount,
           so each queued interview opens a fresh, pre-filled form. */
        key={sharingConfig.id}
        isOpen
        config={sharingConfig}
        initialCandidates={prefilled.length > 0 ? prefilled : undefined}
        onClose={() => {
          if (advancingRef.current) {
            advancingRef.current = false;
            return;
          }
          closeShare();
          reportInvited();
        }}
        onInviteSent={() => {
          sentRef.current = true;
          if (shareIndex + 1 < shareQueue.length) {
            advancingRef.current = true;
            setShareIndex(shareIndex + 1);
            return;
          }
          closeShare();
          reportInvited();
        }}
      />
    );
  }

  if (!open) return null;

  /* Same Candidates Selected panel as the Score Resume dialog, in the AI
     Talent Match table's checkbox chrome. */
  const candidatesPanel = resumes && resumes.length > 0 ? (
    <SelectedCandidatesPanel
      resumes={resumes}
      excludedIds={excludedIds}
      onToggleCandidate={(id) =>
        setExcludedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
      }
      tip="Invitations go to each candidate's email address — untick anyone you want to leave out."
      tableCheckboxes
      formatName={formatCandidateName}
    />
  ) : null;

  return (
    <>
      {/* Shell, header, body and footer are the Apply to Job / Score Resume
          dialog's, so the four candidate actions read as one dialog wearing
          different labels rather than four dialogs. */}
      <div
        className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-50 animate-in fade-in duration-200"
        onClick={closePicker}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
        {/* Opened for a job (AI Talent Match), ONE size whichever view is up —
            the Invite to Assessment dialog's: narrower than the cross-job
            dialog, and a fixed height, so "Browse all AI interviews instead"
            swaps the content inside the same box (the list scrolls in the
            body, its wide table sideways in its own shell) rather than growing
            the dialog. */}
        <div className={`bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-lg md:max-w-2xl ${jobId ? 'lg:max-w-4xl xl:max-w-5xl h-[calc(100dvh-1.5rem)] sm:h-[min(46rem,calc(100dvh-3rem))]' : 'lg:max-w-6xl xl:max-w-7xl'} max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200`}>
          <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
                <Brain className="w-4 h-4 text-brand-blue" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight">Invite to AI Interview</h2>
                {/* What the dialog is for. The count lives on the Candidates
                    Selected panel below, which tracks unticking. */}
                <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">Select candidates to invite for an AI interview</p>
              </div>
            </div>
            {/* No X — the footer's Cancel closes. */}
          </div>

          {/* One scrolling body. Over the job's version cards, the cards come
              first and the Candidates Selected panel follows; over the full
              list, the panel leads as before (the list pages and searches). */}
          <div ref={bodyScrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
            {!jobScoped && candidatesPanel}

            {/* The interview list — the same shared picker as the AI Interview
                page's Send Invite popup: search, the
                one-at-a-time note, paging and the Configure Details preview. */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12 tf-loader-center tf-loader-center--compact">
                <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
              </div>
            ) : jobScoped ? (
              <div>
                {/* Opened from a job (AI Talent Match): only that job's
                    interview versions, as selectable cards. */}
                <JobInterviewVersionPicker
                  configs={configs}
                  jobId={jobId as string}
                  selection={selection}
                  onSelectionChange={setSelection}
                  multiple={multiple}
                  selectedIds={pickedIds}
                  onSelectedIdsChange={setPickedIds}
                  jobVersionNumber={jobVersionNumber}
                  onlyConfigId={mappedVersionOnly ? mappedId ?? null : undefined}
                />
                <button
                  type="button"
                  onClick={() => { setSelection(null); setPickedIds([]); setBrowseAll(true); }}
                  className="mt-3 text-xs font-medium text-brand-blue hover:text-brand-blue-2 hover:underline underline-offset-2"
                >
                  Browse all AI interviews instead
                </button>
              </div>
            ) : (
              <>
                {jobId && (
                  <button
                    type="button"
                    onClick={() => { setSelection(null); setPickedIds([]); setBrowseAll(false); }}
                    className="mt-4 mb-4 inline-flex items-center gap-1 text-xs font-medium text-brand-blue hover:text-brand-blue-2 hover:underline underline-offset-2"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                    Back to this job&apos;s interview versions
                  </button>
                )}
                <AIInterviewPicker
                  configs={configs}
                  selection={selection}
                  onSelectionChange={setSelection}
                  multiple={multiple}
                  selectedIds={pickedIds}
                  onSelectedIdsChange={setPickedIds}
                  scrollContainerRef={bodyScrollRef}
                  searchLabel="Search AI Interviews"
                />
              </>
            )}

            {jobScoped && candidatesPanel && <div className="mt-5">{candidatesPanel}</div>}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-6 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 shrink-0">
            {/* Same footer sentence as the job dialog: what is missing, then
                what is about to happen. */}
            <div className="min-w-0 sm:truncate sm:whitespace-nowrap text-xs sm:text-sm text-gray-700 dark:text-slate-300">
              {noPresetCandidates
                ? (pickedCount === 0
                    ? (jobScoped ? 'Select an interview version to continue' : multiple ? 'Select at least one AI interview to continue' : 'Select one AI interview to continue')
                    : 'Next: add the candidates to invite')
                : invitees.length === 0
                ? 'Select at least one candidate to continue'
                : pickedCount === 0
                  ? (jobScoped ? 'Select an interview version to continue' : multiple ? 'Select at least one AI interview to continue' : 'Select one AI interview to continue')
                  : (
                    <span className="inline-flex items-center gap-1.5 align-middle">
                      <CheckCircle className="w-4 h-4 text-brand-blue flex-shrink-0" />
                      Ready to invite {invitees.length} candidate{invitees.length === 1 ? '' : 's'} to {singlePick
                        ? `Interview V${interviewVersionOrdinal(singlePick, configs)}`
                        : `${pickedCount} AI interview${pickedCount === 1 ? '' : 's'}`}
                    </span>
                  )}
            </div>
            <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
              {/* Cancel — closes without sending or opening the share step,
                  exactly as the X used to. */}
              <Button variant="secondary" onClick={closePicker} className="flex-1 sm:flex-none !h-9">
                Cancel
              </Button>
              <button
                onClick={proceedToShare}
                disabled={pickedCount === 0 || (!noPresetCandidates && invitees.length === 0)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-colors shadow-md shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Mail className="w-4 h-4" />
                {noPresetCandidates
                  ? (singlePick ? `Continue with V${interviewVersionOrdinal(singlePick, configs)}` : 'Continue')
                  : singlePick ? `Send with V${interviewVersionOrdinal(singlePick, configs)}` : 'Send Invitations'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
