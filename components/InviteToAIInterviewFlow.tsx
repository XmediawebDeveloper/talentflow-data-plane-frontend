'use client';

import { useEffect, useState } from 'react';
import { Brain, CheckCircle, Clock, Loader2, Mail, MapPin, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatIST } from '@/lib/utils/dateUtils';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
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
}: InviteToAIInterviewFlowProps) {
  const [configs, setConfigs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [prefilled, setPrefilled] = useState<{ name: string; email: string; resumeId?: string }[]>([]);
  /** Candidates unticked in the panel — listed, but not invited. */
  const [excludedIds, setExcludedIds] = useState<string[]>([]);

  const invitees = candidates.filter((candidate) => !excludedIds.includes(candidate.id));

  // Only published configs can take invites, so drafts and archived ones never
  // reach the list. Fetched on first open, then reused.
  useEffect(() => {
    if (!open || hasLoaded) return;
    setHasLoaded(true);
    setIsLoading(true);
    aiInterviewService
      .listConfigs({ status: 'published', page_size: 100, compact: true })
      .then((response) => setConfigs(response.items || []))
      .catch(() => {
        toast.error('Failed to load AI interviews');
        setConfigs([]);
      })
      .finally(() => setIsLoading(false));
  }, [open, hasLoaded]);

  const closePicker = () => {
    setSearchQuery('');
    setSelectedConfig(null);
    setExcludedIds([]);
    onClose();
  };

  const proceedToShare = () => {
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
    setSelectedConfig(null);
    setPrefilled([]);
    setSearchQuery('');
    setExcludedIds([]);
    onClose();
  };

  if (isSharing && selectedConfig) {
    return (
      <ShareAIInterviewModal
        isOpen
        config={selectedConfig}
        initialCandidates={prefilled}
        onClose={closeShare}
        onInviteSent={() => {
          closeShare();
          onInvited?.();
        }}
      />
    );
  }

  if (!open) return null;

  const query = searchQuery.trim().toLowerCase();
  const visibleConfigs = configs.filter(
    (config) =>
      !query ||
      // Everything the row shows is searchable, JD number and location included.
      `${config.jd_title || ''} ${config.position || ''} ${config.display_id || ''} ${config.jd_short_id || ''} ${config.jd_location || ''}`
        .toLowerCase()
        .includes(query)
  );

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
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-lg md:max-w-2xl lg:max-w-3xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
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
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
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

            <div className="mb-4">
              <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Search AI Interviews</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by interview ID, role or job title..."
                  className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                />
              </div>
            </div>

            {/* Section heading and Clear Selection, as on the job list. */}
            <div className="flex items-center justify-between gap-2 mb-3">
              <label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300">
                Select an AI Interview
                {visibleConfigs.length > 0 && (
                  <span className="ml-2 font-normal text-gray-500 dark:text-slate-400">
                    {visibleConfigs.length} available
                  </span>
                )}
              </label>
              {selectedConfig && (
                <button
                  onClick={() => setSelectedConfig(null)}
                  className="text-xs text-brand-blue hover:text-brand-blue-2 font-medium"
                >
                  Clear Selection
                </button>
              )}
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12 tf-loader-center tf-loader-center--compact">
                <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
              </div>
            ) : visibleConfigs.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm font-medium text-gray-700 mb-1">
                  {configs.length === 0 ? 'No published AI interviews' : 'No interviews match your search'}
                </p>
                <p className="text-xs text-gray-500">
                  {configs.length === 0
                    ? 'Publish an AI interview before inviting candidates to it.'
                    : 'Try a different job title or interview ID.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {visibleConfigs.map((config) => {
                  const isSelected = selectedConfig?.id === config.id;
                  /* One interview at a time, so the rest go inert once one is
                     picked — the job and assessment lists behave the same. */
                  const blockedByOtherPick = !!selectedConfig && !isSelected;
                  // Rounds can be switched off individually; only the live ones count.
                  const enabledRounds = (config.rounds_config || []).filter(
                    (round: any) => round.enabled !== false,
                  ).length;
                  return (
                    <label
                      key={config.id}
                      title={blockedByOtherPick
                        ? 'Only one AI interview can be sent at a time — clear the current selection to choose this one'
                        : undefined}
                      aria-disabled={blockedByOtherPick}
                      className={`block w-full text-left p-4 rounded-lg border-2 transition-all ${
                        blockedByOtherPick
                          ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                          : isSelected
                            ? 'border-brand-blue/50 bg-brand-blue/5 shadow-sm shadow-brand-blue/10 cursor-pointer'
                            : 'border-gray-200 hover:border-brand-blue/30 hover:bg-brand-blue/5 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="invite-to-ai-interview-selection"
                          checked={isSelected}
                          disabled={blockedByOtherPick}
                          onChange={() => !blockedByOtherPick && setSelectedConfig(config)}
                          onClick={() => isSelected && setSelectedConfig(null)}
                          className="w-4 h-4 flex-shrink-0 text-brand-blue border-gray-300 focus:ring-brand-blue/40 disabled:cursor-not-allowed"
                        />
                        <div className="min-w-0 flex-1">
                          {/* Same four lines the Invite to Assessment rows use:
                              ID + role + status, the JD it came from, then the
                              interview's shape and who set it up. */}
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            {config.display_id && (
                              <span className="inline-flex items-center px-2.5 py-1 bg-brand-blue text-white rounded text-xs font-semibold shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                                {config.display_id}
                              </span>
                            )}
                            <h5 className="font-medium text-gray-900">
                              {config.jd_title || config.position || 'Untitled'}
                            </h5>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ring-1 bg-green-100 text-green-700 ring-green-200">
                              {config.status === 'published' ? 'Active' : config.status}
                            </span>
                            {isSelected && <CheckCircle className="w-5 h-5 text-brand-blue ml-auto flex-shrink-0" />}
                          </div>

                          {config.jd_short_id && (
                            <div className="text-xs text-gray-700 font-medium mb-1.5">
                              <span>{config.jd_short_id}</span>
                              {config.jd_title && <span className="ml-2">{config.jd_title}</span>}
                              {config.jd_version && (
                                <span className="ml-1 text-gray-500">v{config.jd_version}</span>
                              )}
                            </div>
                          )}

                          <div className="flex items-center gap-3 text-sm text-gray-500 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {config.duration_minutes || 30} min
                            </span>
                            {enabledRounds > 0 && (
                              <>
                                <span>•</span>
                                <span>{enabledRounds} round{enabledRounds === 1 ? '' : 's'}</span>
                              </>
                            )}
                            {!!config.total_questions && (
                              <>
                                <span>•</span>
                                <span>{config.total_questions} question{config.total_questions === 1 ? '' : 's'}</span>
                              </>
                            )}
                            {config.jd_location && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1 min-w-0">
                                  <MapPin className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate">{config.jd_location}</span>
                                </span>
                              </>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-xs text-gray-500 mt-1.5">
                            {config.created_by_name && (
                              <>
                                <span>Created by: <span className="text-gray-700 font-medium">{config.created_by_name}</span></span>
                                <span>•</span>
                              </>
                            )}
                            {config.created_at && <span>{formatIST(config.created_at)}</span>}
                          </div>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-6 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 shrink-0">
            {/* Same footer sentence as the job dialog: what is missing, then
                what is about to happen. */}
            <div className="min-w-0 truncate whitespace-nowrap text-xs sm:text-sm text-gray-700 dark:text-slate-300">
              {invitees.length === 0
                ? 'Select at least one candidate to continue'
                : !selectedConfig
                  ? 'Select one AI interview to continue'
                  : (
                    <span className="inline-flex items-center gap-1.5 align-middle">
                      <CheckCircle className="w-4 h-4 text-brand-blue flex-shrink-0" />
                      Ready to invite {invitees.length} candidate{invitees.length === 1 ? '' : 's'} to 1 AI interview
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
                disabled={!selectedConfig || invitees.length === 0}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-colors shadow-md shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Mail className="w-4 h-4" />
                Send Invitations
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
