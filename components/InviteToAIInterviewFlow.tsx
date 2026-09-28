'use client';

import { useEffect, useRef, useState } from 'react';
import { Brain, CheckCircle, Loader2, Mail, X } from 'lucide-react';
import { toast } from 'sonner';
import { aiInterviewService, type AIInterviewResponse } from '@/lib/services/aiInterviewService';
import AIInterviewPicker, { type AIInterviewPickerSelection } from '@/components/ai-interview/AIInterviewPicker';
import JobInterviewVersionPicker from '@/components/ai-interview/JobInterviewVersionPicker';
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
}: InviteToAIInterviewFlowProps) {
  /** Escape hatch from the job-scoped picker to the full list. */
  const [browseAll, setBrowseAll] = useState(false);
  const jobScoped = !!jobId && !browseAll;
  const [configs, setConfigs] = useState<AIInterviewResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [selection, setSelection] = useState<AIInterviewPickerSelection | null>(null);
  const selectedConfig = selection ? configs.find((c) => c.id === selection.interviewId) ?? null : null;
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const [isSharing, setIsSharing] = useState(false);
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
      return [...live, ...archived].filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
    })()
      .then(setConfigs)
      .catch(() => {
        toast.error('Failed to load AI interviews');
        setConfigs([]);
      })
      .finally(() => setIsLoading(false));
  }, [open, hasLoaded]);

  const closePicker = () => {
    setSelection(null);
    setBrowseAll(false);
    setExcludedIds([]);
    onClose();
  };

  const proceedToShare = () => {
    if (noPresetCandidates) {
      setPrefilled([]);
      setIsSharing(true);
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

    setPrefilled(withEmail);
    setIsSharing(true);
  };

  const closeShare = () => {
    setIsSharing(false);
    setBrowseAll(false);
    setSelection(null);
    setPrefilled([]);
    setExcludedIds([]);
    onClose();
  };

  if (isSharing && selectedConfig) {
    return (
      <ShareAIInterviewModal
        isOpen
        config={selectedConfig}
        initialCandidates={prefilled.length > 0 ? prefilled : undefined}
        onClose={closeShare}
        onInviteSent={() => {
          closeShare();
          onInvited?.();
        }}
      />
    );
  }

  if (!open) return null;

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
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-lg md:max-w-2xl lg:max-w-6xl xl:max-w-7xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
          <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60">
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
            <button
              onClick={closePicker}
              className="p-1.5 text-gray-500 dark:text-slate-500 hover:text-brand-blue hover:bg-brand-blue/5 rounded-md transition-colors flex-shrink-0"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* One scrolling body, as in the job dialog: panel, search, list. */}
          <div ref={bodyScrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6">
            {/* Same Candidates Selected panel as the Score Resume dialog. */}
            {resumes && resumes.length > 0 && (
              <SelectedCandidatesPanel
                resumes={resumes}
                excludedIds={excludedIds}
                onToggleCandidate={(id) =>
                  setExcludedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
                }
                tip="Invitations go to each candidate's email address — untick anyone you want to leave out."
              />
            )}

            {/* The interview list — the same shared picker as the AI Interview
                page's Send Invite popup: search, Grouped/Ungrouped, the
                one-at-a-time note, paging and the Configure Details preview. */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12 tf-loader-center tf-loader-center--compact">
                <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
              </div>
            ) : jobScoped ? (
              <div className="mt-5">
                {/* Opened from a job (AI Talent Match): only that job's
                    interview versions, as selectable cards. */}
                <JobInterviewVersionPicker
                  configs={configs}
                  jobId={jobId as string}
                  selection={selection}
                  onSelectionChange={setSelection}
                />
                <button
                  type="button"
                  onClick={() => { setSelection(null); setBrowseAll(true); }}
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
                    onClick={() => { setSelection(null); setBrowseAll(false); }}
                    className="mt-4 mb-1 text-xs font-medium text-brand-blue hover:text-brand-blue-2 hover:underline underline-offset-2"
                  >
                    ← Back to this job&apos;s interview versions
                  </button>
                )}
                <AIInterviewPicker
                  configs={configs}
                  selection={selection}
                  onSelectionChange={setSelection}
                  scrollContainerRef={bodyScrollRef}
                  searchLabel="Search AI Interviews"
                />
              </>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-6 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 shrink-0">
            {/* Same footer sentence as the job dialog: what is missing, then
                what is about to happen. */}
            <div className="min-w-0 truncate whitespace-nowrap text-xs sm:text-sm text-gray-700 dark:text-slate-300">
              {noPresetCandidates
                ? (!selectedConfig
                    ? (jobScoped ? 'Select an interview version to continue' : 'Select one AI interview to continue')
                    : 'Next: add the candidates to invite')
                : invitees.length === 0
                ? 'Select at least one candidate to continue'
                : !selectedConfig
                  ? (jobScoped ? 'Select an interview version to continue' : 'Select one AI interview to continue')
                  : (
                    <span className="inline-flex items-center gap-1.5 align-middle">
                      <CheckCircle className="w-4 h-4 text-brand-blue flex-shrink-0" />
                      Ready to invite {invitees.length} candidate{invitees.length === 1 ? '' : 's'} to {jobScoped ? `Interview V${interviewVersionOrdinal(selectedConfig, configs)}` : '1 AI interview'}
                    </span>
                  )}
            </div>
            <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
              <button
                onClick={closePicker}
                className="flex-1 sm:flex-none px-4 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={proceedToShare}
                disabled={!selectedConfig || (!noPresetCandidates && invitees.length === 0)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-colors shadow-md shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Mail className="w-4 h-4" />
                {noPresetCandidates
                  ? (jobScoped && selectedConfig ? `Continue with V${interviewVersionOrdinal(selectedConfig, configs)}` : 'Continue')
                  : jobScoped && selectedConfig ? `Send with V${interviewVersionOrdinal(selectedConfig, configs)}` : 'Send Invitations'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
