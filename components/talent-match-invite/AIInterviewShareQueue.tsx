'use client';

import { useRef, useState } from 'react';
import ShareAIInterviewModal from '@/components/ai-interview/ShareAIInterviewModal';
import type { AIInterviewResponse } from '@/lib/services/aiInterviewService';

/**
 * The Invite to AI Interview popup's hand-over: the existing "Send AI
 * Interview via Email" step, pre-filled with the ticked candidates, once per
 * picked interview in turn — the same queue InviteToAIInterviewFlow runs. That
 * step owns everything about the invitation (email or Copy Link, message,
 * link expiry, quota) and does the sending.
 */
export default function AIInterviewShareQueue({
  configs,
  candidates,
  interviewVersions,
  onClose,
  onInvited,
  onBack,
  inPopupStep,
  footerTarget,
  jobVersions,
}: {
  configs: AIInterviewResponse[];
  candidates: { name: string; email: string; resumeId?: string }[];
  /** Interview version per config id, when the host already knows it. */
  interviewVersions?: Record<string, number>;
  onClose: () => void;
  /** At least one invitation went out — reported once. */
  /** The number of invitations sent across the queue, once, when it ends. */
  onInvited?: (sentCount: number) => void;
  /** Back to the popup the queue was opened from. */
  onBack?: () => void;
  /** Each interview's step renders inside the host popup (ShareAIInterviewModal
   *  `inPopupStep`), its footer in `footerTarget`. */
  inPopupStep?: boolean;
  footerTarget?: HTMLElement | null;
  /** Job version per config id, when the host knows it. */
  jobVersions?: Record<string, number>;
}) {
  const [index, setIndex] = useState(0);
  /* The share step calls onInviteSent THEN onClose: `advancingRef` tells that
     onClose to move on to the next interview rather than end the queue, and
     `sentRef` / `reportedRef` report a send once, even if the recruiter
     cancels part-way through. */
  const advancingRef = useRef(false);
  const sentRef = useRef(0);
  const reportedRef = useRef(false);
  const finish = () => {
    if (sentRef.current > 0 && !reportedRef.current) {
      reportedRef.current = true;
      onInvited?.(sentRef.current);
    }
    onClose();
  };

  const config = configs[index];
  if (!config) return null;
  return (
    <ShareAIInterviewModal
      /* Keyed per interview: the modal reads its candidates once on mount, so
         each queued interview opens a fresh, pre-filled form. */
      key={config.id}
      isOpen
      config={config}
      interviewVersion={interviewVersions?.[config.id]}
      initialCandidates={candidates.length > 0 ? candidates : undefined}
      onBack={onBack}
      inPopupStep={inPopupStep}
      footerTarget={footerTarget}
      jobVersion={jobVersions?.[config.id]}
      onClose={() => {
        if (advancingRef.current) {
          advancingRef.current = false;
          return;
        }
        finish();
      }}
      onInviteSent={(sent) => {
        sentRef.current += sent;
        if (index + 1 < configs.length) {
          advancingRef.current = true;
          setIndex(index + 1);
          return;
        }
        finish();
      }}
    />
  );
}
