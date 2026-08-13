'use client';

import { useEffect, useState } from 'react';
import { Brain, CheckCircle, Loader2, Mail, X } from 'lucide-react';
import { toast } from 'sonner';
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
      `${config.jd_title || ''} ${config.position || ''} ${config.display_id || ''}`.toLowerCase().includes(query)
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-200" onClick={closePicker} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] sm:max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="flex-shrink-0 flex items-center gap-4 p-6 border-b border-gray-100 bg-gradient-to-r from-brand-blue/[0.06] via-brand-cyan/[0.04] to-white">
            <div className="w-12 h-12 bg-brand-blue rounded-xl flex items-center justify-center shadow-md shadow-brand-blue/25 ring-1 ring-white/10">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Invite to AI Interview</h3>
              <p className="text-sm text-gray-500">
                {invitees.length} candidate{invitees.length !== 1 ? 's' : ''} selected
              </p>
            </div>
            <button
              onClick={closePicker}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Same Candidates Selected panel as the Score Resume dialog. */}
          {resumes && resumes.length > 0 && (
            <div className="flex-shrink-0 px-6 pt-4">
              <SelectedCandidatesPanel
                resumes={resumes}
                excludedIds={excludedIds}
                onToggleCandidate={(id) =>
                  setExcludedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
                }
                tip="Invitations go to each candidate's email address — untick anyone you want to leave out."
              />
            </div>
          )}

          <div className="flex-shrink-0 px-6 pt-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search AI interviews..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-black"
            />
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
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
                  return (
                    <button
                      key={config.id}
                      onClick={() => setSelectedConfig(config)}
                      className={`w-full text-left p-3 rounded-lg border transition-all flex items-center gap-3 ${
                        isSelected
                          ? 'border-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20'
                          : 'border-gray-200 hover:border-brand-blue/40 hover:bg-brand-blue/[0.03]'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                        <Brain className="w-4 h-4 text-brand-blue" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {config.jd_title || config.position || 'Untitled'}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {config.display_id ? `${config.display_id} · ` : ''}
                          {config.duration_minutes || 30} min
                        </div>
                      </div>
                      {isSelected && <CheckCircle className="w-5 h-5 text-brand-blue flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex-shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
            <button
              onClick={closePicker}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={proceedToShare}
              disabled={!selectedConfig}
              className="flex items-center gap-2 px-6 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Mail className="w-4 h-4" />
              Proceed to Send Invitations
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
